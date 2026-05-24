# Organização dos CSS

Os CSS foram modularizados para facilitar leitura e manutenção sem mudar os links usados nos arquivos HTML.

## Arquivos de entrada

- `style.css`: manifesto principal. Ele só importa os módulos de tema, base, componentes, páginas e ajustes finais.
- `style-responsive-animations.css`: manifesto de responsividade e animações. Deve continuar carregando depois de `style.css`.

## Pasta `modules/`

A pasta `assets/css/modules/` concentra os arquivos reais de estilo. A numeração no início do nome define a ordem da cascata, então evite trocar a ordem dos imports sem necessidade.

### Mapa rápido

- `01-theme-tokens.css`: variáveis de tema, cores, fontes, modo claro, escuro e OLED.
- `02-base-reset-typography.css`: reset, body, tipografia e estados básicos.
- `03` a `06`: cards, superfícies, utilitários, formulários, botões, logos e avatares.
- `07` a `09`: sidebar, menu do usuário e responsividade da sidebar.
- `10` a `17`: páginas principais, login, layout, feed, perfil, comunidades, comunidade e configurações.
- `18` a `22`: post único, comentários, thread estilo X/Twitter e preview de comentários.
- `23` a `26`: ajustes finais, scrollbar, correções do OLED, desempenho e novo design de configurações.
- `34`: sidebar direita moderna do feed e skeleton da página pública de usuário.
- `27` a `33`: regras responsivas, mobile, keyframes e transições.

## Onde editar

- Cores, modo OLED e tokens globais: `01-theme-tokens.css` e, para ajustes específicos do OLED, `26-oled-performance-settings.css`.
- Cards clicáveis e superfícies: `03-surfaces-cards-utilities.css`.
- Botões: `05-buttons.css`.
- Sidebar/menu lateral: `07-sidebar-base.css`, `08-sidebar-user-dropdown.css` e `09-sidebar-responsive.css`. Sidebar direita do feed: `34-right-sidebar-profile-loading.css`.
- Feed, posts e comentários gerais: `13-feed-posts-comments.css`.
- Perfil: `14-profile.css`; skeleton da página pública de usuário: `34-right-sidebar-profile-loading.css`.
- Comunidades, amizades e solicitações: `15-communities-friends-requests.css`.
- Página interna de comunidade: `16-community-page.css`.
- Configurações/notificações/sobre/documentos: `17-settings-notifications-docs.css`.
- Regras mobile: arquivos `27` a `32`.
- Animações e transições: `33-animations-transitions.css`.

## Regra de manutenção

Não jogue correções novas no final do CSS sem necessidade. Primeiro encontre o módulo correto e mantenha a ordem da cascata previsível.
