document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const myCommunitiesContainer = document.getElementById('my-communities-container');
  const exploreCommunitiesContainer = document.getElementById('explore-communities-container');
  const memberCountEl = document.getElementById('member-count');
  const creatorCountEl = document.getElementById('creator-count');
  const totalPlatformEl = document.getElementById('total-platform-comm');
  const createBtn = document.getElementById('createCommunityBtn');
  const errorP = document.getElementById('communityError');

  function normalizeCommunitiesData(data = {}) {
    const myCommunities = normalizeArray(data.my_communities, 'results')
      .concat(normalizeArray(data.joined_communities, 'results'))
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map(normalizeCommunity);

    const otherCommunities = normalizeArray(data.other_communities, 'results')
      .concat(normalizeArray(data.communities, 'results'))
      .filter((community) => !myCommunities.some((mine) => mine.slug === community.slug))
      .map(normalizeCommunity);

    const createdCount = Number(data.created_communities_count ?? data.created_count ?? myCommunities.filter((comm) => comm.is_creator).length) || 0;
    const totalVisible = Number(data.total_communities ?? data.total_count ?? data.count ?? (myCommunities.length + otherCommunities.length)) || 0;

    return { myCommunities, otherCommunities, createdCount, totalVisible };
  }

  function renderCommunityCard(community, type) {
    const comm = normalizeCommunity(community);
    const name = escapeHTML(comm.name);
    const description = escapeHTML(comm.description || 'Sem descrição.');
    const members = getCommunityMemberCount(comm);
    const badge = comm.is_creator ? 'Criada por você' : type === 'mine' ? 'Participante' : 'Aberta';

    const action = type === 'mine'
      ? `<a href="community.html?slug=${encodeURIComponent(comm.slug)}" class="community-card-btn">Ver comunidade</a>`
      : `<button class="community-card-btn" type="button" data-join-community="${escapeHTML(comm.slug)}">Entrar</button>`;

    return `
      <article class="community-card">
        ${communityAvatarHTML(comm, 'community-card-avatar')}
        <div class="community-card-body">
          <span class="community-card-tag">${badge}</span>
          <h3>${name}</h3>
          <p>${description}</p>
          <div class="community-card-meta"><span>${members} participante(s)</span></div>
          ${action}
        </div>
      </article>
    `;
  }

  function renderCommunities(data) {
    const { myCommunities, otherCommunities, createdCount, totalVisible } = normalizeCommunitiesData(data);

    myCommunitiesContainer.innerHTML = myCommunities.length
      ? myCommunities.map((comm) => renderCommunityCard(comm, 'mine')).join('')
      : '<div class="api-empty-state">Você ainda não participa de nenhuma comunidade.</div>';

    exploreCommunitiesContainer.innerHTML = otherCommunities.length
      ? otherCommunities.map((comm) => renderCommunityCard(comm, 'explore')).join('')
      : '<div class="api-empty-state">Não há novas comunidades no momento.</div>';

    memberCountEl.textContent = myCommunities.length;
    creatorCountEl.textContent = createdCount;
    totalPlatformEl.textContent = totalVisible;
  }

  async function loadCommunities() {
    try {
      const response = await apiFetch('/api/posts/communities/');
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getApiError(data, 'Erro ao carregar comunidades.'));
      }

      renderCommunities(data || {});
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
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    }
  }

  exploreCommunitiesContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-join-community]');
    if (!button) return;
    joinCommunity(button.dataset.joinCommunity);
  });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = document.getElementById('communityName').value.trim();
      const description = document.getElementById('communityBio').value.trim();
      const photo = document.getElementById('communityPhoto')?.files?.[0];

      errorP.style.display = 'none';

      if (!name) {
        errorP.textContent = 'O nome da comunidade é obrigatório.';
        errorP.style.display = 'block';
        return;
      }

      createBtn.disabled = true;
      createBtn.textContent = 'Criando...';

      try {
        let body;
        if (photo) {
          body = new FormData();
          body.append('name', name);
          body.append('description', description);
          body.append('photo', photo);
        } else {
          body = JSON.stringify({ name, description });
        }

        const response = await apiFetch('/api/posts/communities/create/', {
          method: 'POST',
          body,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          errorP.textContent = getApiError(data, 'Erro ao criar comunidade.');
          errorP.style.display = 'block';
          return;
        }

        document.getElementById('communityName').value = '';
        document.getElementById('communityBio').value = '';
        if (document.getElementById('communityPhoto')) document.getElementById('communityPhoto').value = '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityModal')).hide();
        await loadCommunities();
      } catch (error) {
        console.error(error);
        errorP.textContent = 'Erro de conexão com o servidor.';
        errorP.style.display = 'block';
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Criar';
      }
    });
  }

  await loadLoggedUser();
  await loadCommunities();
});
