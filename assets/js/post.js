/* =========================================================
   Post único: publicação completa, comentários e respostas
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const commSlug = urlParams.get('comm');

  if (!postId) {
    window.location.href = 'feed.html';
    return;
  }

  const mainPostContainer = document.getElementById('main-post-container');
  const commentsList = document.getElementById('post-comments-list');
  const refreshCommentsBtn = document.getElementById('refreshPostCommentsBtn');

  let rootCommentsVisible = 5;
  let currentUser = getLoggedUserFromStorage();

  try {
    currentUser = await loadLoggedUser() || currentUser;
    if (window.ConectaPosts) {
      window.ConectaPosts.currentUser = currentUser;
      window.ConectaPosts.currentUserNickname = currentUser?.nickname || '';
    }
  } catch (error) {
    console.error(error);
  }

  async function fetchPostData(id, slug) {
    const endpoints = [];

    if (slug) {
      endpoints.push(`/api/posts/communities/${slug}/post/${id}/`);
      endpoints.push(`/api/posts/community/${slug}/post/${id}/`);
    } else {
      endpoints.push(`/api/posts/post/${id}/`);
      endpoints.push(`/api/posts/${id}/`);
      endpoints.push(`/api/posts/feed/${id}/`);
    }

    for (const endpoint of endpoints) {
      try {
        const response = await apiFetch(endpoint);
        if (response.ok) return await response.json();
      } catch (error) {
        // Continua para o próximo endpoint disponível.
      }
    }

    try {
      const response = await apiFetch(slug ? `/api/posts/communities/${slug}/` : '/api/posts/feed/');
      if (response.ok) {
        const data = await response.json();
        const posts = slug
          ? normalizeArray(data.posts, 'results', 'items')
          : normalizeArray(data, 'posts', 'results', 'feed', 'items');
        const found = posts.find((post) => String(post.id) === String(id));
        if (found) return found;
      }
    } catch (error) {
      // Fallback final tratado abaixo.
    }

    throw new Error('Publicação não encontrada ou excluída.');
  }

  function renderMoreCommentsButton(totalComments) {
    const remaining = totalComments - rootCommentsVisible;
    if (remaining <= 0) return '';

    return `
      <div class="post-comments-more">
        <button class="btn btn-outline-primary rounded-pill fw-bold px-4" onclick="window.loadMoreRootComments()" type="button">
          Ver mais comentários (${Math.min(5, remaining)})
        </button>
      </div>
    `;
  }

  window.loadMoreRootComments = function() {
    rootCommentsVisible += 5;
    window.loadSinglePost(true);
  };

  window.loadSinglePost = async function loadSinglePost(silent = false) {
    try {
      if (!silent) {
        mainPostContainer.innerHTML = '<p class="text-center text-muted py-4">Carregando publicação...</p>';
        commentsList.innerHTML = '';
      }

      const postData = await fetchPostData(postId, commSlug);

      mainPostContainer.innerHTML = ConectaPosts.renderPostCard(postData, {
        currentUser,
        showCommunityLabel: true,
        canInteract: true,
        isSingleView: true,
        showFullPostButton: false,
      });

      const commentsTree = ConectaPosts.buildCommentsTree(postData);

      if (!commentsTree.length) {
        commentsList.innerHTML = '<p class="post-comments-empty">Nenhum comentário ainda. Seja o primeiro a comentar.</p>';
        return;
      }

      const visibleComments = commentsTree.slice(0, rootCommentsVisible);
      const commentsHTML = visibleComments.map((comment) => ConectaPosts.renderComment(comment, {
        currentUser,
        canInteract: true,
        allowCommentInput: true,
        replyLimit: 1,
      })).join('');

      commentsList.innerHTML = commentsHTML + renderMoreCommentsButton(commentsTree.length);
    } catch (error) {
      console.error(error);
      if (!silent) {
        mainPostContainer.innerHTML = `<p class="text-center text-danger py-5 m-0">${escapeHTML(error.message)}</p>`;
        commentsList.innerHTML = '';
      }
    }
  };

  window.deletePost = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    const response = await apiFetch(`/api/posts/post/${id}/delete/`, { method: 'DELETE' });
    if (response.ok) window.location.href = 'feed.html';
  };

  window.toggleLike = async function(id, btnElement) {
    const response = await apiFetch(`/api/posts/post/${id}/like/`, { method: 'POST' });
    if (!response.ok) return;

    const data = await response.json().catch(() => null);
    const liked = Boolean(data?.liked);
    const svg = btnElement.querySelector('svg');

    btnElement.classList.toggle('liked', liked);
    btnElement.classList.toggle('text-primary-custom', liked);
    if (svg) svg.style.fill = liked ? 'currentColor' : 'none';

    const count = btnElement.querySelector('.like-count');
    if (count) count.textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.enablePostEdit = function(id) {
    const container = document.getElementById(`post-text-content-${id}`);
    if (!container) return;

    const text = container.querySelector('.post-text')?.textContent || container.dataset.raw || '';
    container.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${id}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" onclick="savePostEdit(${id})" type="button">Salvar</button>
          <button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)" type="button">Cancelar</button>
        </div>
      </div>
    `;
    document.getElementById(`edit-post-input-${id}`).value = text;
  };

  window.savePostEdit = async function(id) {
    const content = document.getElementById(`edit-post-input-${id}`)?.value.trim();
    if (!content) return;

    const response = await apiFetch(`/api/posts/post/${id}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });

    if (response.ok) await loadSinglePost(true);
  };

  window.toggleCommentLike = async function(id, btnElement) {
    const response = await apiFetch(`/api/posts/comment/${id}/like/`, { method: 'POST' });
    if (!response.ok) return;

    const data = await response.json().catch(() => null);
    const liked = Boolean(data?.liked);
    const svg = btnElement.querySelector('svg');

    btnElement.classList.toggle('liked', liked);
    btnElement.classList.toggle('text-primary-custom', liked);
    if (svg) {
      svg.style.fill = liked ? 'currentColor' : 'none';
      svg.style.stroke = liked ? 'none' : 'currentColor';
    }

    const count = btnElement.querySelector('.comment-like-count');
    if (count) count.textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.deleteComment = async function(id) {
    if (!confirm('Excluir este comentário?')) return;
    const response = await apiFetch(`/api/posts/comment/${id}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadSinglePost(true);
  };

  window.enableCommentEdit = function(id) {
    const container = document.getElementById(`comment-text-content-${id}`);
    if (!container) return;

    const text = container.querySelector('.tw-text')?.textContent || container.dataset.raw || '';
    container.innerHTML = `
      <div class="comment-edit-inline mt-2">
        <input type="text" id="edit-comment-input-${id}" class="form-control form-control-sm custom-input" maxlength="200">
        <button class="btn btn-sm btn-primary" onclick="saveCommentEdit(${id})" type="button">Salvar</button>
        <button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)" type="button">Cancelar</button>
      </div>
    `;
    document.getElementById(`edit-comment-input-${id}`).value = text;
  };

  window.saveCommentEdit = async function(id) {
    const content = document.getElementById(`edit-comment-input-${id}`)?.value.trim();
    if (!content) return;

    const response = await apiFetch(`/api/posts/comment/${id}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });

    if (response.ok) await loadSinglePost(true);
  };

  refreshCommentsBtn?.addEventListener('click', async () => {
    const icon = refreshCommentsBtn.querySelector('.refresh-icon');
    if (icon) icon.classList.add('spin-animation');
    refreshCommentsBtn.disabled = true;

    await loadSinglePost(true);

    refreshCommentsBtn.disabled = false;
    if (icon) icon.classList.remove('spin-animation');
  });

  loadSinglePost();
});
