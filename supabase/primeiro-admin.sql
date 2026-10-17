-- Primeiro admin do Acordia. Rode uma vez só, à mão (SQL Editor > New query > Run), depois que a
-- migração de acesso já estiver no banco. Troque pelo e-mail da pessoa. Daí em diante, os admins
-- incluem os outros pela página Perfil do app. Não fica em migrations para o e-mail não ir ao repositório.
insert into public.allowed_emails(email, is_admin) values (lower('SEU_EMAIL_AQUI'), true)
  on conflict (email) do update set is_admin = true;
