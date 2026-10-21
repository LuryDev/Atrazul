const RelatorioPDF = (() => {
  const somar = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
  const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
  const largura = (valor, maximo) => `${maximo ? Math.max(1.5, (valor / maximo) * 100) : 0}%`;
  const minTxt = (n) => `${n} min`;

  function agrupar(lista, chave, valor) {
    const mapa = new Map();
    lista.forEach((x) => {
      const k = chave(x);
      const atual = mapa.get(k) || { chave: k, valor: 0, itens: [] };
      atual.valor += valor(x);
      atual.itens.push(x);
      mapa.set(k, atual);
    });
    return [...mapa.values()].sort((a, b) => b.valor - a.valor);
  }

  function barras(itens, maximo, cor) {
    if (!itens.length) return '<p class="imp-vazio">Sem atrasos.</p>';
    return `<div class="imp-barras">${itens.map((i) => `
      <div>
        <div class="imp-barra-rotulo"><span>${esc(i.nome)}</span><strong>${esc(i.texto)}</strong></div>
        <div class="imp-trilho"><div class="imp-barra ${cor}" style="width:${largura(i.valor, maximo)}"></div></div>
      </div>`).join('')}</div>`;
  }

  function calcular(voos, atrasos) {
    const atrasados = voos.filter((v) => v.atraso_total > 0);
    const total = somar(voos, (v) => v.atraso_total);
    const herdado = somar(voos, (v) => v.atraso_herdado);
    const originadores = atrasos.filter((a) => a.tipo === 'ORIGINADOR');
    const pendentes = originadores.filter((a) => a.status === 'PROVISORIO');
    const sintomas = agrupar(atrasos, (a) => a.sintoma_descricao, (a) => a.minutos);
    const raizes = agrupar(atrasos, (a) => a.causa_raiz_descricao, (a) => a.minutos);
    const areas = agrupar(atrasos, (a) => a.causa_raiz_area, (a) => a.minutos);
    const proprio = voos.filter((v) => v.atraso_novo > 0);
    const cascata = voos.filter((v) => v.atraso_novo === 0 && v.atraso_herdado > 0);
    const cadeias = originadores.map((o) => {
      const membros = atrasos.filter((a) => a.raiz_id === o.id);
      const porVoo = agrupar(membros, (a) => a.voo_id, (a) => a.minutos)
        .map((g) => ({ numero: g.itens[0].voo_numero, partida: g.itens[0].partida_prevista, minutos: g.valor }))
        .sort((a, b) => a.partida.localeCompare(b.partida));
      return { raiz: o, total: somar(membros, (a) => a.minutos), voos: porVoo };
    }).sort((a, b) => b.total - a.total);
    return { voos, atrasos, atrasados, total, herdado, originadores, pendentes, sintomas, raizes, areas, proprio, cascata, cadeias };
  }

  function cabecalho(titulo) {
    return `
      <header class="imp-topo">
        <div class="imp-marca">${MARCA_SVG}<div><strong>Atrazul</strong><span>Operação · motivos de atrasos</span></div></div>
        <div class="imp-gerado">
          <strong>${esc(titulo)}</strong>
          Gerado em ${diaCurto(estado.agora)}/${estado.agora.slice(0, 4)} às ${hora(estado.agora)}<br>
          por ${esc(usuario?.nome ?? '')} · ${esc(usuario?.codigo ?? '')}
        </div>
      </header>`;
  }

  function numeros(lista) {
    return `<div class="imp-numeros" style="--colunas:${lista.length}">${lista.map(([nome, valor, extra]) => `
      <div class="imp-numero"><span>${esc(nome)}</span><strong>${esc(valor)}</strong>${extra ? `<small>${esc(extra)}</small>` : ''}</div>`).join('')}</div>`;
  }

  function porQue(d) {
    const sint = d.sintomas.slice(0, 4);
    const raiz = d.raizes.slice(0, 4);
    const maximo = Math.max(1, ...sint.map((s) => s.valor), ...raiz.map((r) => r.valor));
    return `
      <section>
        <h2>Por que atrasaram</h2>
        <div class="imp-grade">
          <div><h3>Motivo no voo</h3>${barras(sint.map((s) => ({ nome: s.chave, valor: s.valor, texto: minTxt(s.valor) })), maximo, 'neutro')}</div>
          <div><h3>Causa raiz</h3>${barras(raiz.map((r) => ({ nome: r.chave, valor: r.valor, texto: minTxt(r.valor) })), maximo, 'serie')}</div>
        </div>
      </section>`;
  }

  function areaESituacao(d) {
    const n = d.voos.length;
    const ok = n - d.proprio.length - d.cascata.length;
    const partes = [
      ['neutro', 'No horário', ok],
      ['origem', 'Problema no próprio voo', d.proprio.length],
      ['serie', 'Atrasaram em cascata', d.cascata.length],
    ];
    return `
      <div class="imp-grade">
        <section>
          <h2>Atraso por área</h2>
          ${barras(d.areas.map((a) => ({ nome: `${a.chave} · ${minTxt(a.valor)}`, valor: pct(a.valor, d.total), texto: `${pct(a.valor, d.total)}%` })), 100, 'serie')}
        </section>
        <section>
          <h2>Situação dos voos</h2>
          <div class="imp-pilha">${partes.filter((p) => p[2]).map(([cor, , v]) => `<div class="imp-barra ${cor}" style="width:${pct(v, n)}%"></div>`).join('')}</div>
          <ul class="imp-legenda">${partes.map(([cor, nome, v]) => `<li><i class="imp-barra ${cor}"></i>${nome}: <strong>${v} ${v === 1 ? 'voo' : 'voos'}</strong></li>`).join('')}</ul>
        </section>
      </div>`;
  }

  const nomeCurto = (quem) => String(quem || '').replace(/\s*\(.*\)\s*$/, '');

  const SITUACAO = (a) => (a.tipo === 'CONSEQUENTE'
    ? ['cinza', 'Cascata']
    : a.status === 'VALIDADO' ? ['azul', 'Confirmado'] : ['vermelho', 'Aguardando']);

  function tabela(d, comNova) {
    if (!d.atrasos.length) return '<p class="imp-vazio">Nenhum atraso registrado neste dia.</p>';
    const voo = (id) => d.voos.find((v) => v.id === id) || {};
    const linhas = [...d.atrasos].sort((a, b) => a.partida_prevista.localeCompare(b.partida_prevista) || a.id - b.id);
    return `
      <table class="imp-tabela">
        <thead><tr><th>Voo</th><th>Partida</th><th class="num">Min</th>${comNova ? '<th>Nova partida</th>' : ''}<th>Motivo no voo</th><th>Causa raiz</th><th>Situação</th></tr></thead>
        <tbody>${linhas.map((a) => {
          const [cor, texto] = SITUACAO(a);
          const raiz = d.atrasos.find((x) => x.id === a.raiz_id);
          const sintoma = a.tipo === 'CONSEQUENTE' ? `Herdado de ${raiz?.voo_numero ?? 'voo anterior'}` : a.sintoma_descricao;
          return `<tr>
            <td><strong>${esc(a.voo_numero)}</strong></td>
            <td>${hora(a.partida_prevista)} ${esc(a.origem)} → ${esc(a.destino)}</td>
            <td class="num"><strong>${a.minutos}</strong></td>
            ${comNova ? `<td>${hora(voo(a.voo_id).partida_estimada)}</td>` : ''}
            <td>${esc(sintoma)}</td>
            <td>${esc(a.causa_raiz_descricao)}</td>
            <td class="imp-${cor}">${texto}${a.tipo === 'ORIGINADOR' && a.status === 'VALIDADO' && a.confirmado_por ? `<small>por ${esc(nomeCurto(a.confirmado_por))}</small>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  function versao1(d, titulo) {
    const pend = d.pendentes.length;
    return `
      ${cabecalho('Relatório de atrasos')}
      <main class="imp-corpo">
        <div class="imp-dia"><h1>${esc(titulo)}</h1><p>${d.voos.length} voos programados · ${new Set(d.voos.map((v) => v.matricula)).size} aeronaves</p></div>
        ${numeros([
          ['Minutos de atraso', minTxt(d.total)],
          ['Voos atrasados', `${d.atrasados.length} de ${d.voos.length}`],
          ['Atraso em cascata', `${pct(d.herdado, d.total)}%`],
        ])}
        ${porQue(d)}
        ${areaESituacao(d)}
        <section>
          <h2>Atrasos do dia</h2>
          ${tabela(d, false)}
          <p class="imp-nota">${pend
            ? `${pend} ${pend === 1 ? 'motivo ainda aguarda' : 'motivos ainda aguardam'} confirmação.`
            : 'Todos os motivos foram confirmados.'} Os atrasos em cascata recebem a causa raiz do voo que os originou.</p>
        </section>
      </main>
      <footer class="imp-rodape"><span>Atrazul · Relatório de ${diaCurto(estado.rel.data)}</span><span>${esc(rotuloModo())}</span></footer>`;
  }

  function rotuloModo() {
    return AO_VIVO ? 'Horário de Brasília' : `Demonstração · horário simulado até ${hora(estado.agora)}`;
  }

  function resumo(d, historico) {
    if (!d.atrasos.length) return ['Nenhum voo atrasou neste dia.'];
    const frases = [];
    const maior = d.cadeias[0];
    if (maior) {
      const r = maior.raiz;
      frases.push(`O maior problema foi <strong>${esc(emFrase(r.sintoma_descricao))}</strong> no <strong>${esc(r.voo_numero)}</strong> (${esc(r.origem)}, ${hora(r.partida_prevista)}), que gerou <strong>${minTxt(maior.total)}</strong> de atraso em <strong>${maior.voos.length} ${maior.voos.length === 1 ? 'voo' : 'voos'}</strong> da aeronave ${esc(r.matricula)}.`);
    }
    frases.push(d.herdado
      ? `<strong>${pct(d.herdado, d.total)}%</strong> dos minutos de atraso foram em cascata, herdados de voos anteriores, e não de problemas novos.`
      : 'Nenhum atraso passou para outros voos: a folga no solo absorveu todos.');
    if (d.areas[0]) frases.push(`A área com mais atraso foi <strong>${esc(d.areas[0].chave)} (${pct(d.areas[0].valor, d.total)}%)</strong>.`);
    if (historico.anterior) {
      const dif = d.total - historico.anterior.total;
      frases.push(`O dia teve <strong>${Math.abs(dif)} min ${dif >= 0 ? 'a mais' : 'a menos'}</strong> que o dia anterior com registro (${diaCurto(historico.anterior.data)})${historico.media !== null
        ? ` e ficou <strong>${Math.abs(Math.round(d.total - historico.media))} min ${d.total >= historico.media ? 'acima' : 'abaixo'}</strong> da média dos dias anteriores`
        : ''}.`);
    }
    const pend = d.pendentes;
    frases.push(pend.length
      ? `<strong>${pend.length} ${pend.length === 1 ? 'motivo' : 'motivos'}</strong> ainda ${pend.length === 1 ? 'aguarda' : 'aguardam'} confirmação (${pend.map((a) => esc(a.voo_numero)).join(', ')}).`
      : 'Todos os motivos do dia foram confirmados.');
    return frases;
  }

  async function buscarHistorico(data) {
    const inicio = new Date(data + 'T00:00:00Z');
    inicio.setUTCDate(inicio.getUTCDate() - 7);
    const voos = (await consulta(db.from('vw_voo_resumo').select('*')
      .gte('partida_prevista', inicio.toISOString().slice(0, 10)).lt('partida_prevista', data).order('partida_prevista')))
      .filter((v) => !v.demonstracao);
    const dias = agrupar(voos, (v) => v.partida_prevista.slice(0, 10), (v) => v.atraso_total)
      .map((g) => ({
        data: g.chave,
        total: g.valor,
        voos: g.itens.length,
        atrasados: g.itens.filter((v) => v.atraso_total > 0).length,
        herdado: somar(g.itens, (v) => v.atraso_herdado),
      }))
      .sort((a, b) => a.data.localeCompare(b.data));
    const media = (f) => (dias.length ? somar(dias, f) / dias.length : null);
    return {
      dias,
      anterior: dias[dias.length - 1] || null,
      media: media((x) => x.total),
      mediaAtrasados: media((x) => x.atrasados),
      mediaPontualidade: media((x) => pct(x.voos - x.atrasados, x.voos)),
      mediaCascata: media((x) => pct(x.herdado, x.total)),
    };
  }

  function comparacao(d, historico) {
    if (!historico.dias.length) return '';
    const dias = [...historico.dias.slice(-6), { data: estado.rel.data, total: d.total, atual: true }];
    const maior = Math.max(1, ...dias.map((x) => x.total));
    const fmt = (n) => (n === null ? '–' : String(Math.round(n * 10) / 10).replace('.', ','));
    const linhas = [
      ['Minutos de atraso', minTxt(d.total), `${fmt(historico.media)} min`],
      ['Voos atrasados', String(d.atrasados.length), fmt(historico.mediaAtrasados)],
      ['Pontualidade', `${pct(d.voos.length - d.atrasados.length, d.voos.length)}%`, `${fmt(historico.mediaPontualidade)}%`],
      ['Atraso em cascata', `${pct(d.herdado, d.total)}%`, `${fmt(historico.mediaCascata)}%`],
    ];
    return `
      <section class="imp-bloco">
        <h2>Comparação com outros dias</h2>
        <div class="imp-grade">
          <div>
            <h3>Minutos de atraso por dia</h3>
            <div class="imp-colunas">${dias.map((x) => `
              <div class="imp-coluna"><span>${x.total}</span><div class="imp-barra ${x.atual ? 'serie' : 'neutro'}" style="height:${Math.max(2, (x.total / maior) * 100)}%"></div></div>`).join('')}</div>
            <div class="imp-colunas-rotulo">${dias.map((x) => `<span>${diaCurto(x.data)}</span>`).join('')}</div>
          </div>
          <div>
            <h3>Este dia contra a média dos dias anteriores</h3>
            <table class="imp-tabela imp-compara">
              <thead><tr><th></th><th class="num">${diaCurto(estado.rel.data)}</th><th class="num">Média</th></tr></thead>
              <tbody>${linhas.map(([n, a, b]) => `<tr><td>${n}</td><td class="num"><strong>${a}</strong></td><td class="num">${b}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  function cascatas(d) {
    const lista = d.cadeias.filter((c) => c.voos.length > 1);
    if (!lista.length) return '<section class="imp-bloco"><h2>Efeito cascata</h2><p class="imp-vazio">Nenhum atraso passou para outros voos.</p></section>';
    return `
      <section class="imp-bloco">
        <h2>Efeito cascata</h2>
        <div class="imp-cartoes">${lista.map((c) => {
          const r = c.raiz;
          return `
            <div class="imp-cartao">
              <div class="imp-cartao-topo"><strong>${esc(r.voo_numero)} · ${esc(r.causa_raiz_descricao)}</strong><b>${minTxt(c.total)}</b></div>
              <p>${esc(r.matricula)} · ${esc(r.origem)} ${hora(r.partida_prevista)} · ${r.minutos} min no próprio voo, ${c.total - r.minutos} min herdados</p>
              <p class="imp-caminho">${c.voos.map((v) => `${esc(v.numero)} +${v.minutos}`).join(' → ')}</p>
            </div>`;
        }).join('')}</div>
      </section>`;
  }

  function aeronavesEOrigem(d) {
    const aeronaves = estado.aeronaves.map((a) => {
      const dela = d.voos.filter((v) => v.matricula === a.matricula);
      return {
        ...a,
        novo: somar(dela, (v) => v.atraso_novo),
        herdado: somar(dela, (v) => v.atraso_herdado),
        atrasados: dela.filter((v) => v.atraso_total > 0).length,
      };
    }).sort((a, b) => (b.novo + b.herdado) - (a.novo + a.herdado));
    const maior = Math.max(1, ...aeronaves.map((a) => a.novo + a.herdado));
    const aeroportos = d.cadeias.reduce((m, c) => m.set(c.raiz.origem, (m.get(c.raiz.origem) || 0) + c.total), new Map());
    const listaAeroportos = [...aeroportos].sort((a, b) => b[1] - a[1]);
    const maxAero = Math.max(1, ...listaAeroportos.map((a) => a[1]));
    const periodo = (v) => (Number(hora(v.partida_prevista).slice(0, 2)) < 12 ? 0 : Number(hora(v.partida_prevista).slice(0, 2)) < 18 ? 1 : 2);
    const periodos = ['Manhã (até 12h)', 'Tarde (12h–18h)', 'Noite (após 18h)']
      .map((nome, i) => [nome, somar(d.voos.filter((v) => periodo(v) === i), (v) => v.atraso_total)]);
    return `
      <div class="imp-grade imp-bloco">
        <section>
          <h2>Atraso por aeronave</h2>
          <div class="imp-barras">${aeronaves.map((a) => `
            <div>
              <div class="imp-barra-rotulo"><span><strong>${esc(a.matricula)}</strong> ${esc(a.modelo)}</span><strong>${a.novo + a.herdado ? `${minTxt(a.novo + a.herdado)} · ${a.atrasados} ${a.atrasados === 1 ? 'voo' : 'voos'}` : 'sem atraso'}</strong></div>
              <div class="imp-trilho imp-dupla"><div class="imp-barra origem" style="width:${(a.novo / maior) * 100}%"></div><div class="imp-barra serie" style="width:${(a.herdado / maior) * 100}%"></div></div>
            </div>`).join('')}</div>
          <ul class="imp-legenda imp-linha"><li><i class="imp-barra origem"></i>Problema próprio</li><li><i class="imp-barra serie"></i>Herdado</li></ul>
        </section>
        <section>
          <h2>Onde e quando começaram</h2>
          <h3>Aeroporto onde o problema surgiu</h3>
          ${barras(listaAeroportos.map(([cod, v]) => ({ nome: cod, valor: v, texto: minTxt(v) })), maxAero, 'serie')}
          <h3 class="imp-espaco">Período do dia</h3>
          <div class="imp-periodos">${periodos.map(([n, v]) => `<div><span>${n}</span><strong>${minTxt(v)}</strong></div>`).join('')}</div>
        </section>
      </div>`;
  }

  function registros(d, pareceres) {
    if (!d.originadores.length) return '';
    return `
      <section class="imp-bloco">
        <h2>Registro e confirmação dos motivos</h2>
        <div class="imp-registros">${d.originadores.map((a) => {
          const dele = pareceres.filter((p) => p.atraso_id === a.id);
          return `
            <div class="imp-cartao">
              <div class="imp-cartao-topo"><strong>${esc(a.voo_numero)} · ${a.minutos} min · ${esc(a.sintoma_descricao)}</strong>
                <span class="${a.status === 'VALIDADO' ? 'imp-azul' : 'imp-vermelho'}">${a.status === 'VALIDADO' ? `Confirmado${a.confirmado_por ? ` por ${esc(a.confirmado_por)}` : ''}: ${esc(a.causa_raiz_descricao)}` : 'Aguardando confirmação'}</span></div>
              <p>${a.observacao ? `Descrição registrada: “${esc(a.observacao)}”` : 'Sem descrição.'}${a.registrado_por ? ` · registrado por ${esc(a.registrado_por)}` : ''}</p>
              <p class="imp-pareceres">${dele.length
                ? dele.map((p) => `<span><strong>${esc(p.area)}</strong>${p.funcionario ? ` (${esc(p.funcionario)})` : ''}: ${esc(emFrase(motivo(p.motivo_codigo).descricao))}${p.justificativa ? `. “${esc(p.justificativa)}”` : ''}</span>`).join('')
                : '<span>Nenhuma área deu parecer.</span>'}</p>
            </div>`;
        }).join('')}</div>
      </section>`;
  }

  async function versao2(d, titulo) {
    const [historico, pareceres] = await Promise.all([
      buscarHistorico(estado.rel.data).catch(() => ({ dias: [], anterior: null, media: null })),
      d.originadores.length
        ? consulta(db.from('parecer').select('*').in('atraso_id', d.originadores.map((a) => a.id)).order('criado_em')).catch(() => [])
        : [],
    ]);
    const aeroportos = new Set(d.voos.flatMap((v) => [v.origem, v.destino])).size;
    const dif = historico.anterior ? d.total - historico.anterior.total : null;
    return `
      ${cabecalho('Relatório completo de atrasos')}
      <main class="imp-corpo">
        <div class="imp-dia"><h1>${esc(titulo)}</h1><p>${d.voos.length} voos programados · ${new Set(d.voos.map((v) => v.matricula)).size} aeronaves · ${aeroportos} aeroportos</p></div>
        ${numeros([
          ['Minutos de atraso', minTxt(d.total), dif === null ? '' : `${dif >= 0 ? '+' : '−'}${Math.abs(dif)} min que ${diaCurto(historico.anterior.data)}`],
          ['Voos atrasados', `${d.atrasados.length} de ${d.voos.length}`, `pontualidade de ${pct(d.voos.length - d.atrasados.length, d.voos.length)}%`],
          ['Atraso em cascata', `${pct(d.herdado, d.total)}%`, `${minTxt(d.herdado)} herdados`],
          ['Atraso médio', minTxt(d.atrasados.length ? Math.round(d.total / d.atrasados.length) : 0), 'por voo atrasado'],
        ])}
        <section class="imp-resumo">
          <h2>Resumo do dia</h2>
          <ul>${resumo(d, historico).map((f) => `<li>${f}</li>`).join('')}</ul>
        </section>
        ${porQue(d)}
        ${areaESituacao(d)}
        ${comparacao(d, historico)}
        <div class="imp-quebra"></div>
        ${cascatas(d)}
        ${aeronavesEOrigem(d)}
        <section class="imp-bloco">
          <h2>Atrasos do dia</h2>
          ${tabela(d, true)}
        </section>
        ${registros(d, pareceres)}
      </main>
      <footer class="imp-rodape"><span>Atrazul · Relatório completo de ${diaCurto(estado.rel.data)}</span><span>${esc(rotuloModo())}</span></footer>`;
  }

  async function gerar() {
    const botao = document.getElementById('rel-pdf');
    if (!estado.rel) return;
    botao.disabled = true;
    try {
      const d = calcular(estado.rel.voos, estado.rel.atrasos);
      const titulo = `${rotuloDiaLongo(estado.rel.data)} de ${estado.rel.data.slice(0, 4)}`;
      let alvo = document.getElementById('impressao');
      if (!alvo) {
        alvo = document.createElement('div');
        alvo.id = 'impressao';
        document.body.appendChild(alvo);
      }
      alvo.className = AO_VIVO ? 'imp-v2' : 'imp-v1';
      alvo.innerHTML = AO_VIVO ? await versao2(d, titulo) : versao1(d, titulo);
      const nomeAntes = document.title;
      document.title = `Atrazul - relatorio ${estado.rel.data}`;
      window.addEventListener('afterprint', () => { document.title = nomeAntes; }, { once: true });
      window.print();
    } catch (e) {
      toast('Não foi possível gerar o PDF: ' + e.message, true);
    } finally {
      botao.disabled = false;
    }
  }

  document.getElementById('rel-pdf')?.addEventListener('click', gerar);
  return { gerar };
})();
