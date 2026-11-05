-- =====================================================================
-- Ho so to chuc day du (mo ta, don vi chu quan, email, website, nam thanh lap).
--
-- THIET KE:
--  * Cot organizations.profile (jsonb) giu NGUYEN VAN ho so ma frontend da bam thanh infoHash luc dang ky tren chuoi
--    (registerOrganization(name, infoHash)). Trinh duyet bam lai profile va so voi info_hash de bao "khop hash".
--  * Cot profile KHONG nam trong grant UPDATE truc tiep. Chi ghi qua ham save_organization_profile (SECURITY DEFINER):
--      - phai dang nhap bang vi va la Manager dang hoat dong cua to chuc;
--      - to chuc Pending: chi luu MOT LAN (hash tren chuoi cung chi dat mot lan luc dang ky);
--      - to chuc Verified: duoc ghi de (khi Manager goi updateOrganization tren chuoi voi hash moi);
--      - to chuc Suspended: tu choi.
--    Nhu vay khong mo rong policy UPDATE cua organizations (van chi cho Manager sua mo ta/logo/loai khi Verified).
--  * Logo KHONG nam trong profile: Storage chi cho Manager cua to chuc da Verified tai logo len.
-- =====================================================================

alter table public.organizations
  add column if not exists profile jsonb
  check (profile is null or (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 8192));

create or replace function public.save_organization_profile(p_org uuid, p_profile jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_old    jsonb;
  v_type   text;
begin
  if public.auth_wallet() is null then
    raise exception 'Can dang nhap bang vi';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object'
     or pg_column_size(p_profile) > 8192
     or p_profile ->> 'schema' is distinct from 'votechain.organization.v1' then
    raise exception 'Ho so to chuc khong hop le';
  end if;
  if not public.has_org_role(p_org, array['Manager']) then
    raise exception 'Chi Manager cua to chuc duoc luu ho so';
  end if;

  select verification_status, profile into v_status, v_old
  from public.organizations where id = p_org for update;

  if v_status is null then raise exception 'Khong tim thay to chuc'; end if;
  if v_status = 'Suspended' then raise exception 'To chuc dang bi dinh chi'; end if;
  if v_status = 'Pending' and v_old is not null then
    raise exception 'To chuc chua xac minh chi duoc luu ho so mot lan';
  end if;

  v_type := p_profile ->> 'organizationType';
  update public.organizations
     set profile = p_profile,
         description = coalesce(left(p_profile ->> 'description', 2000), description),
         organization_type = case when v_type in ('university','faculty','class','club','student_union','community','other')
                                  then v_type else organization_type end
   where id = p_org;
end
$$;

revoke all on function public.save_organization_profile(uuid, jsonb) from public, anon;
grant execute on function public.save_organization_profile(uuid, jsonb) to authenticated;
