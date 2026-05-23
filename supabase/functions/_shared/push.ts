// Web Push -lähetys VAPID-allekirjoituksella
// Käyttää raakaa toteutusta ilman ulkoista kirjastoa

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

interface PushSubscription {
  endpoint: string
  p256dh_key: string
  auth_key: string
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeVapidJwt(audience: string): Promise<string> {
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  )
  const now = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT })
    )
  )

  // VAPID public key: 65 tavua (04 || x || y), poimitaan x ja y JWK-importtia varten
  const pubKeyBytes = base64UrlDecode(VAPID_PUBLIC_KEY)
  const x = base64UrlEncode(pubKeyBytes.slice(1, 33).buffer as ArrayBuffer)
  const y = base64UrlEncode(pubKeyBytes.slice(33, 65).buffer as ArrayBuffer)

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: VAPID_PRIVATE_KEY, x, y, key_ops: ['sign'], ext: false },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const sigInput = `${header}.${payload}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(sigInput)
  )

  return `${sigInput}.${base64UrlEncode(sig)}`
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<{ ok: boolean; status: number }> {
  const payloadStr = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadStr)

  // Haetaan vastaanottajan julkinen avain
  const receiverPublicKey = base64UrlDecode(subscription.p256dh_key)
  const authSecret = base64UrlDecode(subscription.auth_key)

  // ECDH-avainpari sisällön salaamiseen
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )

  const receiverKey = await crypto.subtle.importKey(
    'raw',
    receiverPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverKey },
    senderKeyPair.privateKey,
    256
  )

  const senderPublicKeyRaw = await crypto.subtle.exportKey('raw', senderKeyPair.publicKey)

  // HKDF: luo sisällön salausavain
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])

  const info = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: auth\0'),
    0x01,
  ])
  const contentEncryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info },
    prk,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt']
  )

  // Salaa sisältö AES-GCM:llä
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    contentEncryptionKey,
    payloadBytes
  )

  // VAPID JWT
  const origin = new URL(subscription.endpoint).origin
  const jwt = await makeVapidJwt(origin)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      Encryption: `salt=${base64UrlEncode(salt)}`,
      'Crypto-Key': `dh=${base64UrlEncode(senderPublicKeyRaw)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
    },
    body: new Uint8Array(encrypted),
  })

  return { ok: res.ok, status: res.status }
}
