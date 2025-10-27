(define-constant ERR-NOT-AUTHORIZED u601)
(define-constant ERR-INVALID-AMOUNT u602)
(define-constant ERR-INVALID-PRINCIPAL u603)
(define-constant ERR-PLATFORM-NOT-REGISTERED u604)
(define-constant ERR-INSUFFICIENT-BALANCE u605)
(define-constant ERR-TRANSFER-FAILED u606)
(define-constant ERR-RATE-LIMIT u607)
(define-constant ERR-INVALID-CONVERSION u608)
(define-constant ERR-CONTRACT-NOT-SET u609)
(define-constant ERR-ALREADY-INITIALIZED u610)
(define-constant ERR-INVALID-FEE u611)
(define-constant ERR-FEE-TRANSFER-FAILED u612)
(define-constant ERR-INVALID-STATE u613)
(define-constant ERR-OVERFLOW u614)
(define-constant ERR-UNDERFLOW u615)
(define-constant ERR-INVALID-METADATA u616)
(define-constant ERR-PLATFORM-EXISTS u617)
(define-constant ERR-INVALID-SYMBOL u618)
(define-constant ERR-INVALID-DECIMALS u619)
(define-constant ERR-INVALID-URI u620)

(define-data-var contract-owner principal tx-sender)
(define-data-var token-contract principal tx-sender)
(define-data-var transfer-fee-basis-points uint u50)
(define-data-var min-transfer-amount uint u100)
(define-data-var rate-limit-period uint u10)
(define-data-var initialized bool false)

(define-map platforms
  principal
  {
    name: (string-ascii 32),
    symbol: (string-ascii 8),
    decimals: uint,
    conversion-rate: uint,
    active: bool,
    fee-recipient: principal
  }
)

(define-map user-nonce principal uint)
(define-map rate-limit principal uint)

(define-read-only (get-platform (platform principal))
  (map-get? platforms platform)
)

(define-read-only (is-platform-active (platform principal))
  (match (map-get? platforms platform)
    p (ok (get active p))
    (ok false))
)

(define-read-only (get-transfer-fee (amount uint))
  (ok (/ (* amount (var-get transfer-fee-basis-points)) u10000))
)

(define-read-only (get-user-nonce (user principal))
  (ok (default-to u0 (map-get? user-nonce user)))
)

(define-private (validate-owner)
  (if (is-eq tx-sender (var-get contract-owner))
    (ok true)
    (err ERR-NOT-AUTHORIZED))
)

(define-private (validate-initialized)
  (if (var-get initialized)
    (ok true)
    (err ERR-INVALID-STATE))
)

(define-private (validate-not-initialized)
  (if (not (var-get initialized))
    (ok true)
    (err ERR (err ERR-ALREADY-INITIALIZED)))
)

(define-private (validate-amount (amount uint))
  (if (>= amount (var-get min-transfer-amount))
    (ok true)
    (err ERR-INVALID-AMOUNT))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-PRINCIPAL))
)

(define-private (validate-platform-active (platform principal))
  (match (map-get? platforms platform)
    p (if (get active p) (ok true) (err ERR-PLATFORM-NOT-REGISTERED))
    (err ERR-PLATFORM-NOT-REGISTERED))
)

(define-private (validate-rate-limit (user principal))
  (let ((last (default-to u0 (map-get? rate-limit user))))
    (if (>= (- block-height last) (var-get rate-limit-period))
      (ok true)
      (err ERR-RATE-LIMIT)))
)

(define-private (calculate-net-amount (amount uint) (fee uint))
  (if (>= amount fee)
    (ok (- amount fee))
    (err ERR-UNDERFLOW))
)

(define-public (initialize (token principal) (fee-bp uint) (min-amount uint) (rate-period uint))
  (begin
    (try! (validate-owner))
    (try! (validate-not-initialized))
    (try! (validate-principal token))
    (asserts! (<= fee-bp u500) (err ERR-INVALID-FEE))
    (try! (validate-amount min-amount))
    (var-set token-contract token)
    (var-set transfer-fee-basis-points fee-bp)
    (var-set min-transfer-amount min-amount)
    (var-set rate-limit-period rate-period)
    (var-set initialized true)
    (ok true))
)

(define-public (register-platform
    (platform principal)
    (name (string-ascii 32))
    (symbol (string-ascii 8))
    (decimals uint)
    (conversion-rate uint)
    (fee-recipient principal))
  (begin
    (try! (validate-owner))
    (try! (validate-initialized))
    (try! (validate-principal platform))
    (try! (validate-principal fee-recipient))
    (asserts! (> (len name) u0) (err ERR-INVALID-METADATA))
    (asserts! (> (len symbol) u0) (err ERR-INVALID-SYMBOL))
    (asserts! (<= decimals u18) (err ERR-INVALID-DECIMALS))
    (asserts! (> conversion-rate u0) (err ERR-INVALID-CONVERSION))
    (asserts! (is-none (map-get? platforms platform)) (err ERR-PLATFORM-EXISTS))
    (map-set platforms platform
      {
        name: name,
        symbol: symbol,
        decimals: decimals,
        conversion-rate: conversion-rate,
        active: true,
        fee-recipient: fee-recipient
      })
    (print { event: "platform-registered", platform: platform, name: name })
    (ok true))
)

(define-public (update-platform-status (platform principal) (active bool))
  (begin
    (try! (validate-owner))
    (try! (validate-initialized))
    (try! (validate-platform-active platform))
    (map-set platforms platform
      (merge (unwrap! (map-get? platforms platform) (err ERR-PLATFORM-NOT-REGISTERED))
        { active: active }))
    (print { event: "platform-status-updated", platform: platform, active: active })
    (ok true))
)

(define-public (update-conversion-rate (platform principal) (new-rate uint))
  (begin
    (try! (validate-owner))
    (try! (validate-initialized))
    (asserts! (> new-rate u0) (err ERR-INVALID-CONVERSION))
    (map-set platforms platform
      (merge (unwrap! (map-get? platforms platform) (err ERR-PLATFORM-NOT-REGISTERED))
        { conversion-rate: new-rate }))
    (ok true))
)

(define-public (transfer-to-platform
    (amount uint)
    (recipient-platform principal)
    (user principal))
  (let (
        (platform (unwrap! (map-get? platforms recipient-platform) (err ERR-PLATFORM-NOT-REGISTERED)))
        (fee (/ (* amount (var-get transfer-fee-basis-points)) u10000))
        (net-amount (unwrap! (calculate-net-amount amount fee) (err ERR-UNDERFLOW)))
        (converted-amount (* net-amount (get conversion-rate platform)))
        (nonce (+ (default-to u0 (map-get? user-nonce user)) u1)))
    (try! (validate-initialized))
    (try! (validate-amount amount))
    (try! (validate-platform-active recipient-platform))
    (try! (validate-rate-limit user))
    (asserts! (is-eq tx-sender user) (err ERR-NOT-AUTHORIZED))
    (try! (contract-call? (var-get token-contract) transfer amount user (as-contract tx-sender) none))
    (try! (as-contract (contract-call? (var-get token-contract) transfer fee tx-sender (get fee-recipient platform) none)))
    (map-set user-nonce user nonce)
    (map-set rate-limit user block-height)
    (print {
      event: "transfer-to-platform",
      user: user,
      platform: recipient-platform,
      amount: amount,
      fee: fee,
      net-amount: net-amount,
      converted: converted-amount,
      nonce: nonce
    })
    (ok converted-amount))
)

(define-public (transfer-between-users
    (amount uint)
    (recipient principal))
  (let (
        (fee (/ (* amount (var-get transfer-fee-basis-points)) u10000))
        (net-amount (unwrap! (calculate-net-amount amount fee) (err ERR-UNDERFLOW)))
        (nonce (+ (default-to u0 (map-get? user-nonce tx-sender)) u1)))
    (try! (validate-initialized))
    (try! (validate-amount amount))
    (try! (validate-principal recipient))
    (try! (validate-rate-limit tx-sender))
    (try! (contract-call? (var-get token-contract) transfer amount tx-sender (as-contract tx-sender) none))
    (try! (as-contract (contract-call? (var-get token-contract) transfer fee tx-sender (var-get contract-owner) none)))
    (try! (as-contract (contract-call? (var-get token-contract) transfer net-amount tx-sender recipient none)))
    (map-set user-nonce tx-sender nonce)
    (map-set rate-limit tx-sender block-height)
    (print {
      event: "user-to-user-transfer",
      from: tx-sender,
      to: recipient,
      amount: amount,
      fee: fee,
      net-amount: net-amount,
      nonce: nonce
    })
    (ok net-amount))
)

(define-public (update-transfer-fee (new-fee-bp uint))
  (begin
    (try! (validate-owner))
    (asserts! (<= new-fee-bp u500) (err ERR-INVALID-FEE))
    (var-set transfer-fee-basis-points new-fee-bp)
    (ok true))
)

(define-public (update-min-transfer (new-min uint))
  (begin
    (try! (validate-owner))
    (try! (validate-amount new-min))
    (var-set min-transfer-amount new-min)
    (ok true))
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (validate-owner))
    (try! (validate-principal new-owner))
    (var-set contract-owner new-owner)
    (ok true))
)