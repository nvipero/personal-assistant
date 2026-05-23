-- Token-salauksen apufunktiot — kutsutaan Edge Functioneista service_role:lla

create or replace function public.encrypt_token(
  plaintext text,
  key_hex text
) returns bytea as $$
  select pgp_sym_encrypt(plaintext, key_hex);
$$ language sql security definer;

create or replace function public.decrypt_token(
  ciphertext bytea,
  key_hex text
) returns text as $$
  select pgp_sym_decrypt(ciphertext, key_hex);
$$ language sql security definer;

-- Vain service_role saa kutsua
revoke all on function public.encrypt_token(text, text) from public, anon, authenticated;
revoke all on function public.decrypt_token(bytea, text) from public, anon, authenticated;
grant execute on function public.encrypt_token(text, text) to service_role;
grant execute on function public.decrypt_token(bytea, text) to service_role;
