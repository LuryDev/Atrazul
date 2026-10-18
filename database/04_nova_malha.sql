create temp table malha_nova (numero text, matricula text, origem char(3), destino char(3), partida time, chegada time);
insert into malha_nova (numero, matricula, origem, destino, partida, chegada) values
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


create or replace function abrir_dia(p_data date default null)
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

delete from malha_voo;
insert into malha_voo select * from malha_nova;

delete from voo
 where partida_prevista::date >= agora()::date
   and not exists (select 1 from atraso a join voo v on v.id = a.voo_id
                    where v.partida_prevista::date = voo.partida_prevista::date);

select abrir_dia();

select numero, origem, destino, partida, chegada from malha_voo order by matricula, partida;
