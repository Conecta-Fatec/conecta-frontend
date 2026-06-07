/* =========================================================
   Comunidades: listagem, busca instantânea e paginação leve
   - Otimizado com Skeleton Loader e Session Cache
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

  function getCommunityPageSize() {
    const sizeMode = document.documentElement.dataset.fontSizeMode || document.body?.dataset.fontSizeMode || 'normal';
    return sizeMode === 'xlarge' ? 2 : 3;
  }

  const state = {
    myCommunities: [],
    otherCommunities: [],
    createdCount: 0,
    totalVisible: 0,
    query: '',
    myVisible: getCommunityPageSize(),
    exploreVisible: getCommunityPageSize(),
  };

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

  async function loadCommunities(silent = false) {
    const cacheKey = '@conecta:cache_communities_list';

    await window.useSWR(
      cacheKey,
      async () => {
        const response = await apiFetch('/api/posts/communities/');
        if (!response.ok) throw new Error('Erro ao carregar comunidades.');
        return response.json();
      },
      (data) => {
        const normalized = normalizeCommunitiesData(data || {});
        Object.assign(state, normalized);
        renderCommunities();
      },
      {
        silent: silent,
        storage: 'session',
        onLoading: () => {
          const skeletonCard = `
            <div class="community-card placeholder-glow" style="border: 1px solid var(--border-color); background: var(--surface-color); padding: 1.125rem; border-radius: var(--radius-lg); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--card-gap);">
              <div class="placeholder" style="width: 86px; height: 86px; border-radius: var(--radius-md); background-color: var(--line-color);"></div>
              <div class="d-flex flex-column w-100 h-100">
                <div class="placeholder rounded w-75 mb-3" style="height: 18px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-50 mt-auto" style="height: 12px; background-color: var(--line-color);"></div>
              </div>
            </div>`;
          myCommunitiesContainer.innerHTML = skeletonCard.repeat(2);
          exploreCommunitiesContainer.innerHTML = skeletonCard.repeat(3);
        },
        onError: (error, hasCache) => {
          if (!silent && !hasCache) {
            myCommunitiesContainer.innerHTML = '<div class="api-empty-state text-danger">Erro ao carregar comunidades.</div>';
            exploreCommunitiesContainer.innerHTML = '';
          }
        }
      }
    );
  }

  async function joinCommunity(slug) {
    try {
      const response = await apiFetch(`/api/posts/communities/${slug}/join/`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao entrar na comunidade.'));
        return;
      }
      await loadCommunities(true); // Carrega silenciosamente
    } catch (error) { alert('Erro de conexão com o servidor.'); }
  }

  // Escuta os cliques no botão "Ver Mais" e de "Entrar" com trava visual
  document.addEventListener('click', async (event) => {
    const joinButton = event.target.closest('[data-join-community]');
    if (joinButton) { 
        event.preventDefault(); 
        event.stopPropagation(); 
        window.travarBotao(joinButton);
        await joinCommunity(joinButton.dataset.joinCommunity); 
        window.destravarBotao(joinButton);
        return; 
    }

    const moreButton = event.target.closest('[data-more]');
    if (!moreButton) return;
    const pageSize = getCommunityPageSize();
    if (moreButton.dataset.more === 'my-communities') state.myVisible += pageSize;
    if (moreButton.dataset.more === 'explore-communities') state.exploreVisible += pageSize;
    renderCommunities();
  });

  searchInput?.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.myVisible = getCommunityPageSize();
    state.exploreVisible = getCommunityPageSize();
    renderCommunities();
  });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = document.getElementById('communityName').value.trim();
      const communityBio = document.getElementById('communityBio');
      const description = communityBio.value.trim();
      const photo = document.getElementById('communityPhoto')?.files?.[0];

      errorP.style.display = 'none';

      if (!name) { errorP.textContent = 'O nome da comunidade é obrigatório.'; errorP.style.display = 'block'; return; }
      if (window.ConectaCharCounter && !window.ConectaCharCounter.validateOrShow(communityBio, errorP, 'descrição')) return;

      window.travarBotao(createBtn, true);

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

        document.getElementById('communityName').value = ''; communityBio.value = ''; if (communityBio.__conectaCounterUpdate) communityBio.__conectaCounterUpdate();
        if (document.getElementById('communityPhoto')) document.getElementById('communityPhoto').value = '';

        bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityModal')).hide();
        await loadCommunities(true); // Atualiza a lista por trás
      } catch (error) {
        console.error(error); errorP.textContent = 'Erro de conexão com o servidor.'; errorP.style.display = 'block';
      } finally {
        window.destravarBotao(createBtn, true);
        createBtn.textContent = 'Criar';
      }
    });
  }

  await loadLoggedUser();
  await loadCommunities();
});