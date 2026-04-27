document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const myCommunitiesContainer = document.getElementById('my-communities-container');
  const exploreCommunitiesContainer = document.getElementById('explore-communities-container');
  const memberCountEl = document.getElementById('member-count');
  const creatorCountEl = document.getElementById('creator-count');
  const totalPlatformEl = document.getElementById('total-platform-comm');
  const createBtn = document.getElementById('createCommunityBtn');
  const errorP = document.getElementById('communityError');

  function renderCommunityCard(comm, type) {
    const name = escapeHTML(comm.name);
    const description = escapeHTML(comm.description || 'Sem descrição.');
    const initials = getInitials(comm.name);
    const members = comm.total_members ?? 0;
    const badge = comm.is_creator ? 'Criada por você' : type === 'mine' ? 'Participante' : 'Aberta';
    const photo = comm.photo_url
      ? `<div class="community-card-avatar has-image"><img src="${escapeHTML(comm.photo_url)}" alt="Foto de ${name}"></div>`
      : `<div class="community-card-avatar">${initials}</div>`;

    const action = type === 'mine'
      ? `<a href="community.html?slug=${encodeURIComponent(comm.slug)}" class="community-card-btn">Ver comunidade</a>`
      : `<button class="community-card-btn" type="button" data-join-community="${escapeHTML(comm.slug)}">Entrar</button>`;

    return `
      <article class="community-card">
        ${photo}
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
    const myComms = data.my_communities || [];
    const otherComms = data.other_communities || [];
    const createdCount = data.created_communities_count || 0;

    myCommunitiesContainer.innerHTML = myComms.length
      ? myComms.map((comm) => renderCommunityCard(comm, 'mine')).join('')
      : '<div class="api-empty-state">Você ainda não participa de nenhuma comunidade.</div>';

    exploreCommunitiesContainer.innerHTML = otherComms.length
      ? otherComms.map((comm) => renderCommunityCard(comm, 'explore')).join('')
      : '<div class="api-empty-state">Não há novas comunidades no momento.</div>';

    memberCountEl.textContent = myComms.length;
    creatorCountEl.textContent = createdCount;
    totalPlatformEl.textContent = myComms.length + otherComms.length;
  }

  async function loadCommunities() {
    try {
      const response = await apiFetch('/api/posts/communities/');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getApiError(data, 'Erro ao carregar comunidades.'));
      }

      renderCommunities(data);
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

      errorP.style.display = 'none';

      if (!name) {
        errorP.textContent = 'O nome da comunidade é obrigatório.';
        errorP.style.display = 'block';
        return;
      }

      createBtn.disabled = true;
      createBtn.textContent = 'Criando...';

      try {
        const response = await apiFetch('/api/posts/communities/create/', {
          method: 'POST',
          body: JSON.stringify({ name, description }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          errorP.textContent = getApiError(data, 'Erro ao criar comunidade.');
          errorP.style.display = 'block';
          return;
        }

        document.getElementById('communityName').value = '';
        document.getElementById('communityBio').value = '';
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
