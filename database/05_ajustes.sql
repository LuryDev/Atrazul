alter table atraso add column if not exists confirmado_por text;

insert into funcionario (codigo, nome, area, senha_hash)
values ('AZL-002', 'Lucas Pontes', 'CCO', extensions.crypt('azl02', extensions.gen_salt('bf')))
on conflict (codigo) do update
   set nome = excluded.nome, area = excluded.area, senha_hash = excluded.senha_hash;

create or replace view vw_atraso_detalhado as
with recursive subida as (
    select id as atraso_id, id as atual_id, atraso_pai_id, 0 as profundidade
      from atraso
    union all
    select s.atraso_id, a.id, a.atraso_pai_id, s.profundidade + 1
      from subida s join atraso a on a.id = s.atraso_pai_id
),
raiz as (
    select atraso_id, atual_id as raiz_id, profundidade
      from subida where atraso_pai_id is null
)
select a.id, a.voo_id, v.numero as voo_numero, v.matricula,
       v.origem, v.destino, v.partida_prevista,
       a.tipo, a.status, a.minutos, a.atraso_pai_id, a.observacao,
       a.motivo_codigo           as sintoma_codigo,
       ms.descricao              as sintoma_descricao,
       r.raiz_id,
       ar.motivo_codigo          as causa_raiz_codigo,
       mr.descricao              as causa_raiz_descricao,
       mr.categoria              as causa_raiz_categoria,
       mr.area_responsavel       as causa_raiz_area,
       ar.status                 as causa_raiz_status,
       r.profundidade,
       a.registrado_por,
       a.registrado_em,
       a.confirmado_por
  from atraso a
  join voo    v  on v.id  = a.voo_id
  join motivo ms on ms.codigo = a.motivo_codigo
  join raiz   r  on r.atraso_id = a.id
  join atraso ar on ar.id = r.raiz_id
  join motivo mr on mr.codigo = ar.motivo_codigo;

alter view vw_atraso_detalhado set (security_invoker = true);

create or replace function op_validar_atraso(p_token uuid, p_atraso_id int, p_motivo_final text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
    v_f funcionario;
begin
    v_f := funcionario_da_sessao(p_token);
    perform validar_atraso(p_atraso_id, p_motivo_final);
    update atraso set confirmado_por = v_f.nome || ' (' || v_f.codigo || ')' where id = p_atraso_id;
end;
$$;

create or replace function aplicar_eventos()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    e      record;
    v_voo  int;
    v_orig int;
    v_id   int;
    v_log  jsonb := '[]'::jsonb;
begin
    for e in
        select * from evento_simulado
         where not aplicado and acontece_em <= agora()
         order by acontece_em, id
    loop
        select id into v_voo from voo where numero = e.voo_numero;
        select id into v_orig from atraso
         where voo_id = v_voo and tipo = 'ORIGINADOR' and motivo_codigo <> '93'
         order by id desc limit 1;

        if e.tipo = 'ATRASO' then
            v_id := registrar_atraso(v_voo, e.motivo, e.minutos, e.texto);
            update atraso set registrado_em = e.acontece_em, registrado_por = e.autor where id = v_id;
            v_log := v_log || jsonb_build_object('hora', to_char(e.acontece_em, 'HH24:MI'),
                     'texto', e.voo_numero || ' atrasou ' || e.minutos || ' min: ' ||
                              (select descricao from motivo where codigo = e.motivo));
        elsif e.tipo = 'PARECER' and v_orig is not null then
            v_id := registrar_parecer(v_orig, e.area, e.motivo, e.texto);
            update parecer set criado_em = e.acontece_em, funcionario = e.autor where id = v_id;
            v_log := v_log || jsonb_build_object('hora', to_char(e.acontece_em, 'HH24:MI'),
                     'texto', e.area || ' deu parecer sobre o atraso do ' || e.voo_numero);
        elsif e.tipo = 'VALIDACAO' and v_orig is not null then
            perform validar_atraso(v_orig, e.motivo);
            update atraso set confirmado_por = e.autor where id = v_orig;
            v_log := v_log || jsonb_build_object('hora', to_char(e.acontece_em, 'HH24:MI'),
                     'texto', 'Causa oficial do atraso do ' || e.voo_numero || ' validada');
        end if;

        update evento_simulado set aplicado = true where id = e.id;
    end loop;
    return v_log;
end;
$$;

revoke execute on function aplicar_eventos() from public, anon, authenticated;

select codigo, nome, area from funcionario order by codigo;
