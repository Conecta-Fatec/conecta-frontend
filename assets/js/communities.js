/* =========================================================
   Comunidades: listagem, busca instantânea e paginação leve
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const myCommunitiesContainer = document.getElementById('my-communities-container');
  const exploreCommunitiesContainer = document.getElementById('explore-communities-container');
  const memberCountEl = document.getElementById('member-count');
  const creatorCountEl = document.getElementById('creator-count');
  const totalPlatformEl = document.getElementById('total-platform-comm');
  const searchInput = document.getElementById('communitySearch');
  const createBtn = document.getElementById('createCommunityBtn');
  const errorP = document.getElementById('communityError');

  // Estado que controla as listas e a pesquisa
  const state = {
    myCommunities: [],
    otherCommunities: [],
    createdCount: 0,
    totalVisible: 0,
    query: '',
    myVisible: 3,
    exploreVisible: 3,
  };

  // Filtra e classifica as comunidades que vieram da API
  function normalizeCommunitiesData(data = {}) {
    const mineRaw = normalizeArray(data.my_communities, 'results').concat(normalizeArray(data.joined_communities, 'results'));

    const myCommunities = mineRaw
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map(normalizeCommunity)
      .sort((a, b) => Number(Boolean(b.is_creator)) - Number(Boolean(a.is_creator)) || getCommunityMemberCount(b) - getCommunityMemberCount(a));

    const otherCommunities = normalizeArray(data.other_communities, 'results')
      .concat(normalizeArray(data.communities, 'results'))
      .filter((community) => !myCommunities.some((mine) => mine.slug === community.slug))
      .map(normalizeCommunity)
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .sort((a, b) => getCommunityMemberCount(b) - getCommunityMemberCount(a));

    const createdCount = Number(data.created_communities_count ?? data.created_count ?? myCommunities.filter((comm) => comm.is_creator).length) || 0;
    const totalVisible = Number(data.total_communities ?? data.total_count ?? data.count ?? (myCommunities.length + otherCommunities.length)) || 0;

    return { myCommunities, otherCommunities, createdCount, totalVisible };
  }

  function matchesSearch(community = {}) {
    if (!state.query) return true;
    const haystack = `${community.name || ''} ${community.description || ''}`.toLowerCase();
    return haystack.includes(state.query);
  }

  function communityCardContent(comm, badge, actionHTML = '') {
    return `
      ${communityAvatarHTML(comm, 'community-card-avatar')}
      <div class="community-card-body">
        <span class="community-card-tag">${badge}</span>
        <h3>${escapeHTML(comm.name)}</h3>
        <p>${escapeHTML(comm.description || 'Sem descrição.')}</p>
        <div class="community-card-meta">
          <span>${getCommunityMemberCount(comm)} participante(s)</span>
        </div>
        ${actionHTML}
      </div>
    `;
  }

  function renderCommunityCard(community, type) {
    const comm = normalizeCommunity(community);
    const isMine = type === 'mine';
    const badge = comm.is_creator ? 'Criada por você' : isMine ? 'Participante' : 'Aberta';
    const communityUrl = `community.html?slug=${encodeURIComponent(comm.slug)}`;

    return `
      <a href="${communityUrl}" class="community-card community-card-link" aria-label="Abrir comunidade ${escapeHTML(comm.name)}">
        ${communityCardContent(comm, badge, '<span class="community-text-link">Ver comunidade</span>')}
      </a>
    `;
  }

  // Função genérica de renderização com botão Ver Mais
  function renderLimitedList(container, items, visible, type, emptyText, moreAction) {
    if (!items.length) {
      container.innerHTML = `<div class="api-empty-state">${emptyText}</div>`;
      return;
    }

    const shown = items.slice(0, visible);
    container.innerHTML = shown.map((item) => renderCommunityCard(item, type)).join('');

    if (items.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div class="load-more-wrap">
          <button class="load-more-btn" type="button" data-more="${moreAction}">Ver mais</button>
        </div>
      `);
    }
  }

  function renderCommunities() {
    const filteredMine = state.myCommunities.filter(matchesSearch);
    const filteredExplore = state.otherCommunities.filter(matchesSearch);

    renderLimitedList(myCommunitiesContainer, filteredMine, state.myVisible, 'mine', 'Você ainda não participa de nenhuma comunidade.', 'my-communities');
    renderLimitedList(exploreCommunitiesContainer, filteredExplore, state.exploreVisible, 'explore', 'Não há novas comunidades no momento.', 'explore-communities');

    memberCountEl.textContent = state.myCommunities.length;
    creatorCountEl.textContent = state.createdCount;
    totalPlatformEl.textContent = state.totalVisible;
  }

  async function loadCommunities() {
    try {
      const response = await apiFetch('/api/posts/communities/');
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(getApiError(data, 'Erro ao carregar comunidades.'));

      const normalized = normalizeCommunitiesData(data || {});
      Object.assign(state, normalized);
      renderCommunities();
    } catch (error) {
      console.error(error);
      myCommunitiesContainer.innerHTML = '<div class="api-empty-state text-danger">Erro ao carregar comunidades.</div>';
      exploreCommunitiesContainer.innerHTML = '';
    }
  }

  async function joinCommunity(slug) {
    try {
      const response = await apiFetch(`/api/posts/communities/${slug}/join/`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao entrar na comunidade.'));
        return;
      }
      await loadCommunities();
    } catch (error) { alert('Erro de conexão com o servidor.'); }
  }

  // Escuta os cliques no botão "Ver Mais"
  document.addEventListener('click', (event) => {
    const joinButton = event.target.closest('[data-join-community]');
    if (joinButton) { event.preventDefault(); event.stopPropagation(); joinCommunity(joinButton.dataset.joinCommunity); return; }

    const moreButton = event.target.closest('[data-more]');
    if (!moreButton) return;
    if (moreButton.dataset.more === 'my-communities') state.myVisible += 3;
    if (moreButton.dataset.more === 'explore-communities') state.exploreVisible += 3;
    renderCommunities();
  });

  // Filtra em tempo real (Pesquisa sem apertar ENTER)
  searchInput?.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.myVisible = 3;
    state.exploreVisible = 3;
    renderCommunities();
  });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = document.getElementById('communityName').value.trim();
      const description = document.getElementById('communityBio').value.trim();
      const photo = document.getElementById('communityPhoto')?.files?.[0];

      errorP.style.display = 'none';

      if (!name) { errorP.textContent = 'O nome da comunidade é obrigatório.'; errorP.style.display = 'block'; return; }

      createBtn.disabled = true; createBtn.textContent = 'Criando...';

      try {
        let body;
        if (photo) {
          body = new FormData(); body.append('name', name); body.append('description', description); body.append('photo', photo);
        } else {
          body = JSON.stringify({ name, description });
        }

        const response = await apiFetch('/api/posts/communities/create/', { method: 'POST', body });
        const data = await response.json().catch(() => null);

        if (!response.ok) { errorP.textContent = getApiError(data, 'Erro ao criar comunidade.'); errorP.style.display = 'block'; return; }

        document.getElementById('communityName').value = ''; document.getElementById('communityBio').value = '';
        if (document.getElementById('communityPhoto')) document.getElementById('communityPhoto').value = '';

        bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityModal')).hide();
        await loadCommunities();
      } catch (error) {
        console.error(error); errorP.textContent = 'Erro de conexão com o servidor.'; errorP.style.display = 'block';
      } finally {
        createBtn.disabled = false; createBtn.textContent = 'Criar';
      }
    });
  }

  await loadLoggedUser();
  await loadCommunities();
});