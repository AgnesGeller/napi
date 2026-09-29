-- Napi app: a korábbi, túl széles táblajogok lezárása a revízióvédett RPC mögött.

revoke all on public.napi_app_config from authenticated;
grant select on public.napi_app_config to authenticated;
