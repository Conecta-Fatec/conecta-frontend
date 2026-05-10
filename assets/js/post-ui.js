/* =========================================================
   ConectaPosts: renderização de posts/comentários
   - ESTILO TIKTOK: Sem balão de comentário, "Responder" em texto e Paginação de Respostas
========================================================= */
(function () {
  // Injeta automaticamente o CSS do botão "Responder" estilo TikTok
  const style = document.createElement('style');
  style.innerHTML = `
    .tk-text-reply-btn { background: none; border: none; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); padding: 0; cursor: pointer; transition: color 0.2s; }
    .tk-text-reply-btn:hover { color: var(--text-color); text-decoration: underline; }
  `;
  document.head.appendChild(style);

  // Inicializa o cache global
  window.ConectaPosts = window.ConectaPosts || {};
  window.ConectaPosts.postCache = new Map();

  // Controle de paginação de respostas (TikTok Style)
  window.replyPagination = window.replyPagination || new Map();

  window.loadMoreReplies = function(commentId) {
    const current = window.replyPagination.get(commentId) || 1; // Padrão é 1 visível
    window.replyPagination.set(commentId, current + 3); // Carrega +3
    if (typeof window.loadSinglePost === 'function') window.loadSinglePost(true);
  };

  window.hideReplies = function(commentId, defaultLimit) {
    window.replyPagination.set(commentId, defaultLimit); // Volta pro padrão
    if (typeof window.loadSinglePost === 'function') window.loadSinglePost(true);
  };

  const ICONS = {
    likeOutline: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>',
    likeSolid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>',
    edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
  };

  function getCommentReplies(comment = {}) {
    const replies = comment.replies || comment.children || comment.answers || [];
    return Array.isArray(replies) ? replies : normalizeArray(replies, 'results', 'items');
  }

  function buildCommentsTree(post = {}) {
    const topLevel = normalizeArray(post.top_level_comments, 'results');
    const comments = normalizeArray(post.comments, 'results');
    const source = topLevel.length ? topLevel : comments;
    if (!source.length) return [];
    if (!source.some((comment) => comment.parent || comment.parent_id)) return source;

    const byId = new Map();
    source.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: getCommentReplies(comment).slice() });
    });

    const roots = [];
    byId.forEach((comment) => {
      const parentId = typeof comment.parent === 'object' ? comment.parent?.id : (comment.parent || comment.parent_id);
      if (parentId && byId.has(parentId)) byId.get(parentId).replies.push(comment);
      else roots.push(comment);
    });
    return roots;
  }

  function flattenReplies(comment = {}) {
    const result = [];
    const walk = (items, currentParentAuthor) => {
      items.forEach((item) => {
        item.parentAuthor = currentParentAuthor;
        result.push(item);
        const replies = getCommentReplies(item);
        if (replies.length) walk(replies, item.author);
      });
    };
    walk(getCommentReplies(comment), comment.author);
    return result;
  }

  function renderThreadItem(item, options, isReply = false, parentAuthor = null, hasNext = false) {
    const author = item.author || {};
    const isOwner = author.nickname === options.currentUser?.nickname;
    const canReply = options.allowCommentInput !== false;
    const when = relativeTime(item.created_at || item.updated_at, '');
    const likeIcon = item.liked_by_me ? ICONS.likeSolid : ICONS.likeOutline;

    return `
      <div class="tw-comment-wrapper">
        <div class="tw-avatar-col">
          <a href="${profileUrlFor(author)}" class="tw-avatar-link">${avatarHTML(author, 'comment-avatar')}</a>
          ${hasNext ? '<div class="tw-thread-line"></div>' : ''}
        </div>
        <div class="tw-content-col">
          
          <div class="tw-header" style="margin-bottom: 0.15rem;">
            <a href="${profileUrlFor(author)}" class="tw-author-name" style="font-size: 0.95rem;">${escapeHTML(userDisplayName(author))}</a>
            ${isReply && parentAuthor ? `
              <span style="color: var(--text-muted); font-size: 0.8rem; margin: 0 0.3rem;">▸</span>
              <a href="${profileUrlFor(parentAuthor)}" class="tw-author-name text-muted" style="font-weight: 500; font-size: 0.9rem;">${escapeHTML(parentAuthor.nickname || parentAuthor.first_name)}</a>
            ` : ''}
            ${item.edited ? '<span class="tw-date ms-1">(editado)</span>' : ''}
          </div>

          <div id="comment-text-content-${item.id}" data-raw="${escapeHTML(item.content)}">
            <p class="tw-text">${escapeHTML(item.content)}</p>
          </div>

          <div class="d-flex justify-content-between align-items-center mt-1">
            <div class="d-flex align-items-center gap-3">
              <span class="tw-date" style="font-size: 0.85rem; color: var(--text-muted);">${escapeHTML(when)}</span>
              ${options.showActions !== false && canReply ? `
              <button class="tk-text-reply-btn" onclick="toggleReplyInput(${item.id})">Responder</button>` : ''}
            </div>

            ${options.showActions !== false ? `
            <div class="d-flex align-items-center gap-1">
              <button class="tw-action-btn like-btn ${item.liked_by_me ? 'liked' : ''}" onclick="toggleCommentLike(${item.id}, this)" title="Curtir" style="gap: 0.2rem;">
                <div class="tw-icon-circle" style="width: 26px; height: 26px;">${likeIcon}</div>
                <span class="comment-like-count" style="font-size: 0.85rem;">${item.total_likes ?? item.likes_count ?? 0}</span>
              </button>

              ${isOwner ? `
              <button class="tw-action-btn edit-btn" onclick="enableCommentEdit(${item.id})" title="Editar">
                <div class="tw-icon-circle" style="width: 26px; height: 26px;">${ICONS.edit}</div>
              </button>
              <button class="tw-action-btn delete-btn" onclick="deleteComment(${item.id})" title="Excluir">
                <div class="tw-icon-circle" style="width: 26px; height: 26px;">${ICONS.trash}</div>
              </button>
              ` : ''}
            </div>
            ` : ''}
          </div>

          ${options.showActions !== false && canReply ? `
          <div id="reply-box-${item.id}" class="tw-reply-box d-none mt-2">
            <input type="text" id="reply-input-${item.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Adicionar comentário...">
            <button class="btn btn-primary rounded-pill btn-sm px-3 fw-bold" onclick="addReply(${item.id})">Enviar</button>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderComment(comment = {}, options = {}) {
    const replies = flattenReplies(comment);
    const defaultLimit = options.replyLimit !== undefined ? options.replyLimit : replies.length;

    const isCustomized = window.replyPagination.has(comment.id);
    const visibleCount = isCustomized ? window.replyPagination.get(comment.id) : defaultLimit;
    const clampedVisible = Math.min(visibleCount, replies.length);

    const visibleReplies = replies.slice(0, clampedVisible);
    let thread = [comment, ...visibleReplies];
    
    let html = `<div class="tw-thread-container">`;
    html += thread.map((item, index) => {
       const hasNext = index < thread.length - 1 || replies.length > clampedVisible;
       const isReply = item.id !== comment.id;
       return renderThreadItem(item, options, isReply, item.parentAuthor, hasNext);
    }).join('');

    // Botões Ocultar/Ver mais (TikTok Style)
    if (replies.length > defaultLimit) {
        const remaining = replies.length - clampedVisible;
        const hasHidden = clampedVisible > defaultLimit;

        if (remaining > 0 || hasHidden) {
            html += `
            <div class="tk-replies-actions">
              <div class="tk-replies-line"></div>`;
            if (remaining > 0) {
                html += `<button class="tk-replies-btn" onclick="window.loadMoreReplies(${comment.id})">Ver mais respostas (${remaining}) ⌄</button>`;
            }
            if (hasHidden) {
                html += `<button class="tk-replies-btn" onclick="window.hideReplies(${comment.id}, ${defaultLimit})">Ocultar ⌃</button>`;
            }
            html += `</div>`;
        }
    }
    html += `</div>`;
    
    return html;
  }

  function renderCommunityChip(post = {}) {
    const community = post.community || post.community_data || null;
    const slug = community?.slug || post.community_slug;
    const name = community?.name || post.community_name;
    if (!name) return '<span class="post-community-chip">Feito no feed</span>';
    if (!slug) return `<span class="post-community-chip">Feito em ${escapeHTML(name)}</span>`;
    return `<a href="community.html?slug=${encodeURIComponent(slug)}" class="post-community-chip">Feito em ${escapeHTML(name)}</a>`;
  }

  function renderPostActions(post = {}, isOwner = false, options = {}) {
    const disabled = options.canInteract === false;
    const pageSlug = new URLSearchParams(window.location.search).get('slug');
    const commObj = post.community || post.community_data || null;
    const commSlug = commObj?.slug || post.community_slug || pageSlug || '';
    const postLink = commSlug ? `post.html?id=${post.id}&comm=${encodeURIComponent(commSlug)}` : `post.html?id=${post.id}`;

    // Ações do POST PRINCIPAL continuam intactas para poder abrir os comentários!
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id}, this)" type="button" aria-label="Curtir publicação" ${disabled ? 'disabled title="Entre para interagir"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${postLikesCount(post)}</span>
      </button>

      <button class="post-action-btn text-decoration-none" type="button" aria-label="Ver comentários" onclick="toggleInlineComments(event, ${post.id}, '${escapeHTML(postLink)}')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>${postCommentsCount(post)}</span>
      </button>

      ${isOwner ? `
        <button class="post-action-btn owner-action" onclick="enablePostEdit(${post.id})" type="button">Editar</button>
        <button class="post-action-btn owner-action delete-action text-danger" onclick="deletePost(${post.id})" type="button">Excluir</button>
      ` : ''}
    `;
  }

  function renderPostCard(post = {}, options = {}) {
    window.ConectaPosts.postCache.set(String(post.id), post);

    const author = options.author || post.author || {};
    const currentUser = options.currentUser || null;
    const isOwner = author.nickname && author.nickname === currentUser?.nickname;
    const when = relativeTime(post.created_at || post.updated_at, 'feito');

    const pageSlug = new URLSearchParams(window.location.search).get('slug');
    const commObj = post.community || post.community_data || null;
    const commSlug = commObj?.slug || post.community_slug || pageSlug || '';
    const postLink = commSlug ? `post.html?id=${post.id}&comm=${encodeURIComponent(commSlug)}` : `post.html?id=${post.id}`;

    return `
      <article class="post-card" id="post-${post.id}" data-post-url="${escapeHTML(postLink)}">
        <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
        <div class="post-body" style="min-width:0;">
          <div class="post-header">
            <div class="text-truncate">
              ${userLinkHTML(author, userDisplayName(author), 'post-author')}
              <span class="post-username">@${escapeHTML(author.nickname || 'usuario')}</span>
              ${when ? `<span> · <a href="${postLink}" class="text-muted text-decoration-none">${escapeHTML(when)}</a></span>` : ''}
              ${post.edited ? ' · <small>(editado)</small>' : ''}
            </div>
          </div>
          ${options.showCommunityLabel ? renderCommunityChip(post) : ''}
          <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}"><p class="post-text">${escapeHTML(post.content)}</p></div>
          <div class="post-actions">${renderPostActions(post, isOwner, options)}</div>
          
          <div id="inline-comments-${post.id}" class="inline-comments-wrapper d-none w-100 mt-2 pt-2 border-top"></div>
        </div>
      </article>
    `;
  }

  window.toggleInlineComments = function(event, postId, postLink) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const container = document.getElementById(`inline-comments-${postId}`);
    if (!container) return;

    if (!container.classList.contains('d-none')) {
        container.classList.add('d-none');
        return;
    }

    container.classList.remove('d-none');

    const postData = window.ConectaPosts.postCache.get(String(postId));

    if (!postData) {
        container.innerHTML = `
            <p class="text-center text-danger small my-2">Post indisponível na memória no momento.</p>
            <a href="${postLink}" class="btn btn-outline-primary btn-sm w-100 rounded-pill mt-2 fw-bold" onclick="event.stopPropagation()">Abrir página do post</a>
        `;
        return;
    }

    const tree = window.ConectaPosts.buildCommentsTree(postData);
    
    if (!tree || tree.length === 0) {
        container.innerHTML = `
            <p class="text-center text-muted small my-2">Nenhum comentário ainda.</p>
            <a href="${postLink}" class="btn btn-outline-primary btn-sm w-100 rounded-pill mt-2 fw-bold" onclick="event.stopPropagation()">Escrever primeiro comentário</a>
        `;
        return;
    }

    let flatList = [];
    function flattenTree(nodes, parentAuthor = null) {
        for(let node of nodes) {
            node.parentAuthor = parentAuthor;
            flatList.push(node);
            const replies = node.replies || node.children || node.answers || [];
            const repArray = Array.isArray(replies) ? replies : (normalizeArray(replies, 'results', 'items') || []);
            if (repArray.length > 0) flattenTree(repArray, node.author);
        }
    }
    flattenTree(tree);

    const top3 = flatList.slice(0, 3);
    let cUser = typeof getLoggedUserFromStorage === 'function' ? getLoggedUserFromStorage() : null;

    let html = `<div class="tw-thread-container">`;
    html += top3.map((item, index) => {
        const hasNext = index < top3.length - 1;
        const isReply = !!item.parentAuthor;
        return renderThreadItem(item, { 
            currentUser: cUser, 
            showActions: false,
            allowCommentInput: false 
        }, isReply, item.parentAuthor, hasNext);
    }).join('');
    html += `</div>`;

    if (flatList.length > 3) {
        html += `<p class="text-center text-muted small mt-3 mb-1 fw-medium">Mostrar mais ${flatList.length - 3} comentário(s)...</p>`;
    }

    html += `<a href="${postLink}" class="btn btn-outline-primary btn-sm w-100 rounded-pill mt-3 fw-bold" onclick="event.stopPropagation()">Ver post completo</a>`;
    container.innerHTML = html;
  };

  window.ConectaPosts.renderPostCard = renderPostCard;
  window.ConectaPosts.buildCommentsTree = buildCommentsTree;
  window.ConectaPosts.renderCommunityChip = renderCommunityChip;
  window.ConectaPosts.renderComment = renderComment;

})();