// Web Push with VAPID and aes128gcm encryption (RFC 8188 + RFC 8291)

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

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeVapidJwt(audience: string): Promise<string> {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT }))
  )

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
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(sigInput))
  return `${sigInput}.${base64UrlEncode(sig)}`
}

// RFC 8291 + RFC 8188: encrypt plaintext for a Web Push subscription
async function encryptPayload(
  plaintext: Uint8Array,
  receiverPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array
): Promise<Uint8Array> {
  const senderKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const senderPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeyPair.publicKey))

  const receiverKey = await crypto.subtle.importKey(
    'raw', receiverPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )
  const ecdhSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverKey }, senderKeyPair.privateKey, 256
  )

  // RFC 8291: derive IKM from ECDH secret + auth secret
  const ecdhKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const prkInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...receiverPublicKeyBytes,
    ...senderPublicKeyRaw,
  ])
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: prkInfo },
    ecdhKey,
    256
  )

  // RFC 8188: derive CEK (128 bits) and nonce (96 bits) from random salt + IKM
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])

  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0') },
    ikmKey,
    128
  )
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: nonce\0') },
    ikmKey,
    96
  )

  const cek = await crypto.subtle.importKey('raw', cekBits, { name: 'AES-GCM', length: 128 }, false, ['encrypt'])
  const nonce = new Uint8Array(nonceBits)

  // Single record: plaintext + 0x02 (last-record delimiter)
  const content = new Uint8Array([...plaintext, 0x02])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, content))

  // RFC 8188 header: salt(16) + rs(4, big-endian) + idlen(1) + keyid(65)
  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + senderPublicKeyRaw.length)
  header.set(salt, 0)
  header[16] = (rs >>> 24) & 0xff
  header[17] = (rs >>> 16) & 0xff
  header[18] = (rs >>> 8) & 0xff
  header[19] = rs & 0xff
  header[20] = senderPublicKeyRaw.length  // 65
  header.set(senderPublicKeyRaw, 21)

  const result = new Uint8Array(header.length + ciphertext.length)
  result.set(header, 0)
  result.set(ciphertext, header.length)
  return result
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<{ ok: boolean; status: number }> {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh_key)
  const authSecret = base64UrlDecode(subscription.auth_key)

  const body = await encryptPayload(
    new TextEncoder().encode(JSON.stringify(payload)),
    receiverPublicKey,
    authSecret
  )

  const origin = new URL(subscription.endpoint).origin
  const jwt = await makeVapidJwt(origin)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      TTL: '86400',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`Push failed: status=${res.status} body=${text}`)
  }

  return { ok: res.ok, status: res.status }
}
