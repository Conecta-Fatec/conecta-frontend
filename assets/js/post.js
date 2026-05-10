/* =========================================================
   Post Único: Exibe a thread do post estilo Twitter
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
  const replyInput = document.getElementById('reply-input');
  const sendReplyBtn = document.getElementById('send-reply-btn');
  
  let rootCommentsVisible = 5;

  window.loadMoreRootComments = function() {
    rootCommentsVisible += 5;
    window.loadSinglePost(true);
  };
  
  let currentUser = getLoggedUserFromStorage();
  try {
    currentUser = await loadLoggedUser() || currentUser;
    if(window.ConectaPosts) window.ConectaPosts.currentUserNickname = currentUser?.nickname || '';
  } catch (error) {
    console.error(error);
  }

  if (currentUser) {
    const avatarContainer = document.getElementById('reply-avatar');
    if (userPhoto(currentUser)) {
      avatarContainer.innerHTML = `<img src="${escapeHTML(toApiUrl(userPhoto(currentUser)))}" alt="Sua foto">`;
      avatarContainer.classList.add('has-image');
    } else {
      avatarContainer.textContent = getInitials(currentUser.nickname || 'U');
    }
  }

  replyInput.addEventListener('input', (e) => {
    sendReplyBtn.disabled = e.target.value.trim().length === 0;
  });

  // CARREGAMENTO SEGUENCIAL OTIMIZADO (Sem sobrecarga de servidor)
  async function fetchPostData(id, slug) {
    let endpoints = [];
    if (slug) {
        endpoints.push(`/api/posts/communities/${slug}/post/${id}/`);
        endpoints.push(`/api/posts/community/${slug}/post/${id}/`);
    } else {
        endpoints.push(`/api/posts/post/${id}/`);
        endpoints.push(`/api/posts/${id}/`);
        endpoints.push(`/api/posts/feed/${id}/`);
    }

    for (const ep of endpoints) {
        try {
            const res = await apiFetch(ep);
            if (res.ok) return await res.json();
        } catch (e) {
            // Continua silenciosamente para a próxima tentativa
        }
    }

    // Busca nas listas principais (Fallback definitivo)
    try {
        if (slug) {
            const res = await apiFetch(`/api/posts/communities/${slug}/`);
            if (res.ok) {
                const data = await res.json();
                const posts = normalizeArray(data.posts, 'results', 'items') || [];
                const found = posts.find(p => String(p.id) === String(id));
                if (found) return found;
            }
        } else {
            const res = await apiFetch(`/api/posts/feed/`);
            if (res.ok) {
                const data = await res.json();
                const posts = normalizeArray(data, 'posts', 'results', 'feed', 'items');
                const found = posts.find(p => String(p.id) === String(id));
                if (found) return found;
            }
        }
    } catch(e) {}

    throw new Error('Publicação não encontrada ou excluída.');
  }

  window.loadSinglePost = async function loadSinglePost(silent = false) {
    try {
      const postData = await fetchPostData(postId, commSlug);
      
      mainPostContainer.innerHTML = ConectaPosts.renderPostCard(postData, {
        currentUser: currentUser,
        showCommunityLabel: true,
        canInteract: true
      });

      const commentBtns = mainPostContainer.querySelectorAll('.post-action-btn[href^="post.html"]');
      commentBtns.forEach(btn => btn.style.display = 'none');

      const treeComments = ConectaPosts.buildCommentsTree(postData);
      
      if (!treeComments || treeComments.length === 0) {
        commentsList.innerHTML = '<p class="text-center text-muted py-5 m-0 border-top">Nenhum comentário ainda. Seja o primeiro a responder!</p>';
      } else {
        const shownRoots = treeComments.slice(0, rootCommentsVisible);
        
        let html = shownRoots.map(c => 
          ConectaPosts.renderComment(c, { 
            currentUser, 
            canInteract: true, 
            allowCommentInput: true, 
            replyLimit: 1 
          })
        ).join('');

        if (treeComments.length > rootCommentsVisible) {
          html += `
            <div class="text-center mt-3 mb-4">
               <button class="btn btn-outline-primary rounded-pill fw-bold px-4" onclick="window.loadMoreRootComments()">
                   Ver mais comentários (${treeComments.length - rootCommentsVisible})
               </button>
            </div>
          `;
        }

        commentsList.innerHTML = html;
      }

    } catch (error) {
      if(!silent) mainPostContainer.innerHTML = `<p class="text-center text-danger py-5 m-0">${error.message}</p>`;
    }
  }

  sendReplyBtn.addEventListener('click', async () => {
    const content = replyInput.value.trim();
    if (!content) return;

    sendReplyBtn.disabled = true;
    sendReplyBtn.textContent = 'Enviando...';

    try {
      const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        replyInput.value = '';
        await loadSinglePost(true);
      } else {
        alert('Erro ao enviar resposta.');
      }
    } catch (error) {
      console.error(error);
    } finally {
      sendReplyBtn.textContent = 'Responder';
      if(replyInput.value.trim().length > 0) sendReplyBtn.disabled = false;
    }
  });

  window.toggleLike = async function(id, btnElement) {
    const res = await apiFetch(`/api/posts/post/${id}/like/`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);

    const isLiked = !!data?.liked;
    btnElement.classList.toggle('liked', isLiked);
    
    const svg = btnElement.querySelector('svg');
    if (svg) {
      if (isLiked) {
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('stroke', 'none');
        svg.innerHTML = '<path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>';
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.innerHTML = '<path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>';
      }
    }
    const countSpan = btnElement.querySelector('.like-count');
    if (countSpan) countSpan.textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.enablePostEdit = function(id) {
    const div = document.getElementById(`post-text-content-${id}`);
    if (!div) return;
    const text = div.querySelector('.post-text')?.textContent || div.getAttribute('data-raw') || '';
    div.innerHTML = `<div class="mb-3 mt-2"><textarea id="edit-post-input-${id}" class="form-control custom-input w-100" rows="3" maxlength="280">${text}</textarea><div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-primary" onclick="savePostEdit(${id})">Salvar</button><button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)">Cancelar</button></div></div>`;
  };

  window.savePostEdit = async function(id) {
    const content = document.getElementById(`edit-post-input-${id}`)?.value.trim();
    if (!content) return;
    const res = await apiFetch(`/api/posts/post/${id}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
    if (res.ok) await loadSinglePost(true);
  };

  window.toggleCommentLike = async function(id, btnElement) {
    const res = await apiFetch(`/api/posts/comment/${id}/like/`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);

    const isLiked = !!data?.liked;
    btnElement.classList.toggle('liked', isLiked);
    
    const svg = btnElement.querySelector('svg');
    if (svg) {
      if (isLiked) {
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('stroke', 'none');
        svg.innerHTML = '<path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>';
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.innerHTML = '<path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>';
      }
    }
    
    const countSpan = btnElement.querySelector('.comment-like-count');
    if (countSpan) countSpan.textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.deleteComment = async function(id) {
    if (!confirm('Excluir este comentário?')) return;
    const res = await apiFetch(`/api/posts/comment/${id}/delete/`, { method: 'DELETE' });
    if (res.ok) await loadSinglePost(true);
  };

  window.enableCommentEdit = function(id) {
    const span = document.getElementById(`comment-text-content-${id}`);
    if (!span) return;
    const text = span.textContent || span.getAttribute('data-raw') || '';
    span.innerHTML = `<span class="comment-edit-inline"><input type="text" id="edit-comment-input-${id}" class="form-control form-control-sm custom-input" maxlength="200" value="${text}"><button class="btn btn-sm btn-primary" onclick="saveCommentEdit(${id})">Salvar</button><button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)">✕</button></span>`;
  };

  window.saveCommentEdit = async function(id) {
    const content = document.getElementById(`edit-comment-input-${id}`)?.value.trim();
    if (!content) return;
    const res = await apiFetch(`/api/posts/comment/${id}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
    if (res.ok) await loadSinglePost(true);
  };

  window.toggleReplyInput = function(id) {
    const box = document.getElementById(`reply-box-${id}`);
    box?.classList.toggle('d-none');
    if(box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${id}`)?.focus();
  };

  window.addReply = async function(id) {
    const input = document.getElementById(`reply-input-${id}`);
    const content = input?.value.trim();
    if (!content) return;
    const res = await apiFetch(`/api/posts/comment/${id}/reply/`, { method: 'POST', body: JSON.stringify({ content }) });
    if (res.ok) await loadSinglePost(true);
  };

  loadSinglePost();
});