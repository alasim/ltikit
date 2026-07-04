

insert into public.lti_platforms
  (issuer, client_id, auth_endpoint, token_endpoint, keyset_url, deployment_id)
values (
  'https://teachsim.moodlecloud.com',                       -- Platform ID
  'wlObN3jTFpwbArG',                                        -- Client ID
  'https://teachsim.moodlecloud.com/mod/lti/auth.php',
  'https://teachsim.moodlecloud.com/mod/lti/token.php',
  'https://teachsim.moodlecloud.com/mod/lti/certs.php',  -- Public keyset URL
  '1'                                     -- Deployment ID
)
on conflict (issuer, client_id) do update set
  auth_endpoint  = excluded.auth_endpoint,
  token_endpoint = excluded.token_endpoint,
  keyset_url     = excluded.keyset_url,
  deployment_id  = excluded.deployment_id;