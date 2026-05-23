import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!

const adminClient = createClient(supabaseUrl, serviceRoleKey)

export async function encryptToken(plaintext: string): Promise<Uint8Array> {
  const { data, error } = await adminClient.rpc('encrypt_token', {
    plaintext,
    key_hex: encryptionKey,
  })
  if (error) throw new Error(`Salaus epäonnistui: ${error.message}`)
  return data as Uint8Array
}

export async function decryptToken(ciphertext: Uint8Array): Promise<string> {
  const { data, error } = await adminClient.rpc('decrypt_token', {
    ciphertext,
    key_hex: encryptionKey,
  })
  if (error) throw new Error(`Dekryptaus epäonnistui: ${error.message}`)
  return data as string
}
