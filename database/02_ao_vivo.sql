truncate sessao, funcionario, parecer, atraso, voo, aeronave, motivo restart identity cascade;
truncate evento_simulado restart identity;

drop view     if exists vw_dias cascade;
drop function if exists abrir_dia(date) cascade;
drop table    if exists malha_voo cascade;

insert into motivo (codigo, descricao, categoria, area_responsavel, reativo) values
('11', 'Aceitação tardia de passageiros (check-in)',    'Passageiros e bagagem', 'Aeroporto',           false),
('18', 'Processamento de bagagem',                      'Passageiros e bagagem', 'Aeroporto',           false),
('33', 'Equipamento de carregamento indisponível',      'Solo',                  'Aeroporto',           false),
('36', 'Abastecimento de combustível',                  'Solo',                  'Aeroporto',           false),
('41', 'Defeito técnico na aeronave',                   'Técnico',               'Manutenção',          false),
('63', 'Apresentação tardia da tripulação técnica',     'Tripulação',            'Escala de tripulação', false),
('71', 'Condições meteorológicas no aeroporto',         'Meteorologia',          'Externo',             false),
('81', 'Restrição do controle de tráfego aéreo',        'Tráfego aéreo',         'Externo',             false),
('87', 'Infraestrutura aeroportuária',                  'Aeroporto',             'Aeroporto',           false),
('93', 'Chegada tardia da aeronave (atraso herdado)',   'Reativo',               'Gerado pelo sistema', true);

insert into aeronave (matricula, modelo) values
('PR-ADA', 'Airbus A320'),
('PR-BEL', 'Embraer E195'),
('PR-COR', 'ATR 72-600');

insert into funcionario (codigo, nome, area, senha_hash) values
('AZL-001', 'Luiz Santos', 'CCO', extensions.crypt('azl01', extensions.gen_salt('bf'))),
('AZL-002', 'Lucas Pontes', 'CCO', extensions.crypt('azl02', extensions.gen_salt('bf')));

create or replace function agora() returns timestamp
language sql stable
set search_path = public
as $$ select (now() at time zone 'America/Sao_Paulo')::timestamp(0) $$;

create table malha_voo (
    numero   text primary key,
    matricula text not null references aeronave(matricula),
    origem   char(3) not null,
    destino  char(3) not null,
    partida  time not null,
    chegada  time not null,
    check (chegada > partida)
);

insert into malha_voo (numero, matricula, origem, destino, partida, chegada) values
('AD4100', 'PR-ADA', 'GRU', 'SDU', '06:00', '07:00'),
('AD4101', 'PR-ADA', 'SDU', 'CNF', '07:45', '08:45'),
('AD4102', 'PR-ADA', 'CNF', 'GRU', '09:30', '10:40'),
('AD4103', 'PR-ADA', 'GRU', 'POA', '11:25', '13:05'),
('AD4104', 'PR-ADA', 'POA', 'GRU', '13:55', '15:35'),
('AD4105', 'PR-ADA', 'GRU', 'SSA', '16:20', '18:40'),
('AD4106', 'PR-ADA', 'SSA', 'GRU', '19:30', '21:50'),

('AD2200', 'PR-BEL', 'CGH', 'CWB', '06:15', '07:25'),
('AD2201', 'PR-BEL', 'CWB', 'FLN', '08:10', '09:00'),
('AD2202', 'PR-BEL', 'FLN', 'CGH', '09:45', '10:55'),
('AD2203', 'PR-BEL', 'CGH', 'VIX', '11:40', '13:10'),
('AD2204', 'PR-BEL', 'VIX', 'CGH', '13:55', '15:25'),
('AD2205', 'PR-BEL', 'CGH', 'CWB', '16:15', '17:25'),
('AD2206', 'PR-BEL', 'CWB', 'CGH', '18:10', '19:20'),

('AD3300', 'PR-COR', 'VCP', 'RAO', '06:45', '07:45'),
('AD3301', 'PR-COR', 'RAO', 'VCP', '08:30', '09:30'),
('AD3302', 'PR-COR', 'VCP', 'UDI', '10:15', '11:25'),
('AD3303', 'PR-COR', 'UDI', 'VCP', '12:10', '13:20'),
('AD3304', 'PR-COR', 'VCP', 'SJP', '14:05', '15:15'),
('AD3305', 'PR-COR', 'SJP', 'VCP', '16:05', '17:15'),
('AD3306', 'PR-COR', 'VCP', 'RAO', '18:00', '19:00');

create unique index if not exists ux_voo_numero_dia on voo (numero, (partida_prevista::date));

create function abrir_dia(p_data date default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
    v_data date := coalesce(p_data, agora()::date);
begin
    if exists (select 1 from voo where partida_prevista::date = v_data) then
        return (select count(*) from voo where partida_prevista::date = v_data);
    end if;
    insert into voo (numero, matricula, origem, destino, partida_prevista, chegada_prevista)
    select m.numero, m.matricula, m.origem, m.destino, v_data + m.partida, v_data + m.chegada
      from malha_voo m
     order by m.matricula, m.partida
    on conflict (numero, (partida_prevista::date)) do nothing;
    return (select count(*) from voo where partida_prevista::date = v_data);
end;
$$;

create or replace function avancar_relogio(p_token uuid, p_minutos int)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
    raise exception 'No Atrazul ao vivo o horário é o real e não pode ser avançado.';
end;
$$;

create or replace function reiniciar_simulacao(p_token uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
    raise exception 'No Atrazul ao vivo os dias ficam guardados e não podem ser reiniciados.';
end;
$$;

create view vw_dias as
select partida_prevista::date as data, count(*)::int as voos
  from voo
 group by 1;

alter table malha_voo enable row level security;
create policy leitura_publica on malha_voo for select using (true);
grant select on malha_voo, vw_dias to anon, authenticated;
alter view vw_dias set (security_invoker = true);

revoke execute on function abrir_dia(date) from public;
grant execute on function abrir_dia(date) to anon, authenticated;

select abrir_dia();
