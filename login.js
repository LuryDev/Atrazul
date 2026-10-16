desenharMarcas();
if (AO_VIVO) document.querySelector('details.demo')?.remove();

const form = document.getElementById('form-funcionario');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = form.querySelector('.erro');
  const botao = form.querySelector('button[type=submit]');
  erro.hidden = true;
  botao.disabled = true;
  try {
    const dados = Object.fromEntries(new FormData(form));
    const token = await consulta(db.rpc('entrar_funcionario', { p_codigo: dados.codigo, p_senha: dados.senha }));
    Sessao.salvar(token);
    await voarAviao(botao);
    location.replace('operacao.html');
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
    botao.disabled = false;
  }
});

(async () => {
  if (!configurado) {
    document.getElementById('aviso-config').hidden = false;
    return;
  }
  const token = Sessao.token();
  if (token) {
    const { data } = await db.rpc('sessao_atual', { p_token: token });
    if (data) location.replace('operacao.html');
    else Sessao.limpar();
  }
  form.querySelector('input').focus();
})();
