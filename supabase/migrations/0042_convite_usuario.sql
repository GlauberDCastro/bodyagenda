-- 0042 · Convite por link para qualquer usuário, não só profissional
--
-- O convite de profissional (0037) cria o acesso ligado ao cadastro dele. O
-- mesmo mecanismo agora convida recepção, SDR, closer, gestão, financeiro ou
-- admin: o admin escolhe o perfil, a pessoa cria e-mail e senha pelo link.
--
-- Um convite é de profissional (profissional_id) OU de perfil (perfil),
-- nunca os dois: o perfil profissional sempre nasce ligado a um cadastro.

alter table convite_profissional rename to convite;
alter table convite alter column profissional_id drop not null;
alter table convite
  add column perfil perfil_usuario,
  add column nome   text,
  add constraint convite_de_profissional_ou_perfil
    check ((profissional_id is not null) <> (perfil is not null)),
  add constraint convite_perfil_nao_profissional
    check (perfil is distinct from 'profissional');
