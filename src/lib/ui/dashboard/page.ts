// Lógica cliente del dashboard (/dashboard). Extraída de dashboard.astro para
// separar el markup de la página del ciclo de vida de datos y mantener el
// archivo de página por debajo del umbral de god-file. Se importa desde el
// <script> de la página y se ejecuta una sola vez, después del DOM.

    import { supabase } from "@/lib/supabase";
    import {
      listMyUploads,
      getUpload,
      deleteMyUpload,
      getMyProfile,
      updateMyProfile,
      getMyGuilds,
      ensureMyProfileSlug,
      getMyCharacters,
      getMyCharacterNotes,
      getMyTrackerData,
      getMyBands,
      getMyMembershipGuilds,
      getMyRulesCatalog,
      listGuildPortalBands,
      claimGuildFromSV,
      tryPromoteMember,
      deleteMyAccount,
      resetMyData,
    } from "@/lib/api";
    import type { UploadSummary, CharacterRow, CharacterNoteData } from "@/lib/api";
    import type { BandRow } from "@/types/database";
    import { handleFromSlug } from "@/lib/ui/playerNames";
    import {
      DASHBOARD_TABS,
      DASHBOARD_CONFIG,
      createTabBar,
      tabFromHash,
      dashboardTabHead,
    } from "@/lib/ui/tabs";
    import { isVisitor } from "@/lib/roles";
    import { ui } from "@/lib/ui/design";
    import { el } from "@/lib/ui/dom";
    import { userError } from "@/lib/ui/userError";
    import { toast } from "@/lib/ui/toast";
    import { renderCharacterCard } from "@/lib/ui/cards";
    import { bandDetailHref, bandNameLink } from "@/lib/ui/bandName";
    import { initTracker, type TrackerController } from "@/lib/ui/dashboard/tracker";
    import { computeProgress, type TrackerCharacter } from "@/lib/ui/dashboard/trackerLogic";
    import { type Facet } from "@/lib/ui/filterBar";
    import { PAGE_SIZE_GRID, PAGE_SIZE_LIST } from "@/lib/ui/paginator";
    import { mountPagedList } from "@/lib/ui/list";
    import { svLabel } from "@/lib/ui/dashboard/format";
    import {
      collectMergedCharacters,
      collectRegistryGuilds,
      renderRegistryGuildCards,
      characterListKey,
      type MergedRegistryCharacter,
      type RegistryGuildCard,
    } from "@/lib/ui/dashboard/visitor";
    import {
      bandPlayerCount,
      bandRuleCount,
      renderBandDetail,
    } from "@/lib/ui/dashboard/bands";
    import { renderGuildCard } from "@/lib/ui/dashboard/guilds";
    import { bandMergeKey, mergeBandPlayers } from "@/lib/bandMerge";
    import type { ParsedSavedVariables, ContentItem } from "@/types/parser";
    import type { RaiddominionRole, GuildRow } from "@/types/database";

    const emailEl = document.getElementById("user-email") as HTMLElement;
    const avatarEl = document.getElementById("avatar") as HTMLElement;
    const badgeEl = document.getElementById("role-badge") as HTMLElement;

    const ROLE_LABELS: Record<RaiddominionRole, string> = {
      visitante: "Visitante",
      member: "Miembro",
      guild_master: "Maestro de Hermandad",
      moderator: "Moderador",
      admin: "Administrador",
    };
    const ROLE_STYLES = ui.badgeRole;

    // Badges del encabezado: cuenta validada (rol >= member) y estado público
    // del perfil. Se refrescan en loadProfile, en la promoción a Miembro y en
    // vivo al cambiar el toggle de perfil público de Configuración.
    const validatedBadgeEl = document.getElementById(
      "validated-badge",
    ) as HTMLElement;
    const publicBadgeEl = document.getElementById(
      "public-badge",
    ) as HTMLElement;
    const BADGE_BASE = `${ui.badge} ${ui.badgeMd}`;

    function refreshHeaderBadges(): void {
      const validated = !isVisitor(currentRole);
      validatedBadgeEl.textContent = validated
        ? "✓ Cuenta validada"
        : "Cuenta sin validar";
      validatedBadgeEl.className = `${BADGE_BASE} ${validated ? ui.status.success : "bg-brand-800/70 border-gray-600 text-gray-400"}`;
      publicBadgeEl.textContent = profilePublic ? "Público" : "Privado";
      publicBadgeEl.className = `${BADGE_BASE} ${profilePublic ? ui.badgeRole.guild_master : "bg-brand-800/70 border-gray-600 text-gray-400"}`;
    }

    // ── Estado reactivo (declarado antes de las llamadas void load*) ─────────
    let currentRole: RaiddominionRole = "member";
    let profilePublic = false;
    let accountEmail = "";
    let myCharacters: CharacterRow[] = [];
    let tracker: TrackerController | null = null;
    let profileCharacterName: string | null = null;
    let uploadsCache: UploadSummary[] = [];
    let currentSvId = "";
    let lastLeads = false;
    let snapshotGmGuilds: string[] = [];
    let myGuilds: GuildRow[] = [];
    let membershipGuilds: GuildRow[] = [];
    let rulesCatalog: ContentItem[] = [];
    // Último análisis renderizado: los indicadores del encabezado de Registro
    // se calculan de él (liberan al visor de repetir cifras).
    let lastSnapshot: ParsedSavedVariables | null = null;
    // Bandas del usuario y banda actualmente seleccionada en el navegador.
    let allBands: BandRow[] = [];
    let currentBandId: string | null = null;
    // Hermandad actualmente seleccionada en el navegador de hermandades.
    let currentGuildId: string | null = null;
    // Integrantes, bandas integradas y reglas por hermandad (roster/portal del
    // último análisis cargado), para los indicadores de cabecera de la ficha
    // seleccionada.
    const guildMembersCount = new Map<string, number>();
    const guildBandsCount = new Map<string, number>();
    const guildRulesCount = new Map<string, number>();

    // ── Indicadores de los encabezados de bloque (Registro/Bandas/Hermandad) ──
    function setHdrChip(id: string, value: number | string): void {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value ?? 0);
    }

    // Registro: personajes, hermandades, bandas y reglas del análisis activo +
    // nº de análisis subidos. Leyendo de lastSnapshot (no del DOM) los chips
    // quedan también correctos antes de que termine el render del visor.
    function refreshHdrRegistro(): void {
      const d = lastSnapshot;
      if (!d) {
        setHdrChip("hdr-registro-chars", 0);
        setHdrChip("hdr-registro-guilds", 0);
        setHdrChip("hdr-registro-bands", 0);
        setHdrChip("hdr-registro-rules", 0);
        return;
      }
      const guildNames = new Set<string>();
      if (d.registryGuild?.name)
        guildNames.add(d.registryGuild.name.trim().toLowerCase());
      d.registries.forEach((reg) => {
        if (reg.guild?.name)
          guildNames.add(reg.guild!.name.trim().toLowerCase());
      });
      setHdrChip("hdr-registro-chars", d.registries.filter((r) => r.player).length);
      setHdrChip("hdr-registro-guilds", guildNames.size);
      setHdrChip("hdr-registro-bands", d.bands.length);
      setHdrChip("hdr-registro-rules", d.rules.length);
    }

    // Los toggles y cambios de estado llaman a refreshHdrBands (nombre legado):
    // ahora solo refresca los indicadores de la banda seleccionada en el header.
    function refreshHdrBands(): void {
      void refreshHdrBandSelected();
    }

    // Conteo de jugadores de una banda INTEGRADA ya combinado con las demás
    // bandas públicas del mismo grupo (clave name|horario|GS). null si no hay
    // grupo (o falla la consulta): en ese caso se usa el roster propio.
    async function mergedBandPlayerCount(b: BandRow): Promise<number | null> {
      try {
        const portal = await listGuildPortalBands(b.guild_id as string);
        if (!portal.ok || !portal.bands) return null;
        const key = bandMergeKey(b);
        const group = portal.bands.filter((x) => bandMergeKey(x) === key);
        if (group.length === 0) return null;
        return mergeBandPlayers(group).length;
      } catch {
        return null;
      }
    }

    // Banda seleccionada en el navegador: nombre·horario·GS en el título del
    // encabezado (formato del selector, el SPAN interno preserva el icono "ul")
    // + indicadores (jugadores, reglas y el estado de integración si lo tiene).
    // El detalle ya no repite título ni badges; esta función se llama en los
    // mismos puntos que refreshHdrBands (toggles y cambios de estado). Para
    // bandas que se combinan por match de nombre|horario, el conteo de jugadores
    // es la UNIÓN del grupo (mismo criterio que el portal y la página de banda).
    async function refreshHdrBandSelected(): Promise<void> {
      const band = currentBandId
        ? allBands.find((b) => b.id === currentBandId)
        : undefined;
      const titleEl = document.getElementById("hdr-band-name-text");
      const metaEl = document.getElementById("hdr-band-name-meta");
      const openEl = document.getElementById("hdr-band-open") as HTMLAnchorElement | null;
      if (titleEl) {
        titleEl.textContent = "";
        if (!band) {
          titleEl.textContent = "Mis bandas";
          if (metaEl) metaEl.textContent = "";
          openEl?.classList.add("hidden");
        } else {
          const name = bandNameLink(band.name || "Banda sin nombre", band.name_link);
          if (name.anchor) titleEl.appendChild(name.anchor);
          else titleEl.textContent = name.label;

          const parts: string[] = [];
          if (band.schedule) parts.push(band.schedule);
          if (typeof band.min_gs === "number" && band.min_gs > 0)
            parts.push(`GS ${band.min_gs}`);
          if (metaEl) metaEl.textContent = parts.length ? `· ${parts.join(" · ")}` : "";

          const href = bandDetailHref(band.slug);
          if (openEl && href) {
            openEl.href = href;
            openEl.setAttribute("aria-label", `Ver la banda ${band.name || "sin nombre"}`);
            openEl.classList.remove("hidden");
          } else {
            openEl?.classList.add("hidden");
          }
        }
      } else {
        openEl?.classList.add("hidden");
      }
      let playersLabel: number | string = band
        ? band.hide_players
          ? "ocultos"
          : bandPlayerCount(band)
        : 0;
      if (
        band &&
        band.guild_id &&
        band.is_rank_integrated &&
        !band.hide_players
      ) {
        const merged = await mergedBandPlayerCount(band);
        if (merged !== null) playersLabel = merged;
      }
      setHdrChip("hdr-band-players", playersLabel);
      setHdrChip("hdr-band-rules", band ? bandRuleCount(band) : 0);

      const statusEl = document.getElementById(
        "hdr-band-status",
      ) as HTMLElement | null;
      if (!statusEl) return;
      const chipBase = `${ui.badge} ${ui.badgeMd}`;
      const st = (band?.integration_status ?? "none") as string;
      if (st !== "none") {
        let text = "";
        let cls = "";
        if (st === "approved" && band!.guild_id && band!.is_public) {
          text = "✓ en el portal de la hermandad";
          cls = "text-emerald-300 bg-emerald-950/30 border-emerald-600/40";
        } else if (st === "approved" && band!.guild_id) {
          text = "✓ integrada · privada";
          cls = "text-emerald-300 bg-emerald-950/30 border-emerald-600/40";
        } else if (st === "pending") {
          text = "propuesta pendiente";
          cls = "text-brand-300 bg-brand-950/30 border-brand-600/40";
        } else if (st === "rejected") {
          text = "✗ propuesta rechazada";
          cls = "text-red-300 bg-red-950/30 border-red-600/40";
        }
        if (text) {
          statusEl.textContent = text;
          statusEl.className = chipBase + " " + cls;
          statusEl.classList.remove("hidden");
          return;
        }
      }
      statusEl.classList.add("hidden");
    }

    // Hermandad: la ficha seleccionada en el navegador → nombre en el título del
    // encabezado (el SPAN interno preserva el icono "ul") + indicadores de ESA
    // hermandad: integrantes, bandas integradas y estados de publicación y de
    // verificación. La ficha ya no repite título ni badges; el total de
    // hermandades vive en el contador del selector ("Hermandad N/total").
    function refreshHdrGuild(): void {
      const guild = currentGuildId
        ? myGuilds.find((g) => g.id === currentGuildId)
        : undefined;

      const nameEl = document.getElementById("hdr-guild-name-text");
      if (nameEl) {
        nameEl.textContent = guild
          ? `${guild.name || "Hermandad sin nombre"}${guild.realm ? ` · ${guild.realm}` : ""}`
          : "Tus hermandades";
      }

      setHdrChip(
        "hdr-guild-members",
        guild ? (guildMembersCount.get(guild.id) ?? 0) : 0,
      );
      setHdrChip(
        "hdr-guild-bands",
        guild ? (guildBandsCount.get(guild.id) ?? 0) : 0,
      );
      setHdrChip(
        "hdr-guild-rules",
        guild ? (guildRulesCount.get(guild.id) ?? 0) : 0,
      );

      const chipBase = `${ui.badge} ${ui.badgeMd}`;
      const visEl = document.getElementById(
        "hdr-guild-vis",
      ) as HTMLElement | null;
      if (visEl) {
        if (!guild) {
          visEl.classList.add("hidden");
        } else {
          visEl.textContent = guild.is_public ? "✓ pública" : "privada";
          visEl.className =
            chipBase +
            (guild.is_public
              ? " text-emerald-300 bg-emerald-950/30 border-emerald-600/40"
              : " text-gray-400 bg-brand-950/50 border-gray-700/50");
          visEl.classList.remove("hidden");
        }
      }

      const claimEl = document.getElementById(
        "hdr-guild-claim",
      ) as HTMLElement | null;
      if (claimEl) {
        if (!guild) {
          claimEl.classList.add("hidden");
        } else {
          const verified = guild.claim_status === "verified";
          claimEl.textContent = verified
            ? "✓ verificada"
            : guild.claim_status === "rejected"
              ? "✗ rechazada"
              : "en revisión";
          claimEl.className =
            chipBase +
            (verified
              ? " text-emerald-300 bg-emerald-950/30 border-emerald-600/40"
              : guild.claim_status === "rejected"
                ? " text-red-300 bg-red-950/30 border-red-600/40"
                : " text-brand-300 bg-brand-950/30 border-brand-600/40");
          claimEl.classList.remove("hidden");
        }
      }
    }

    // ¿Puede publicar bandas/personajes? Un Visitante sin personajes validados
    // no puede activar visibilidad pública hasta validar como Miembro (regla
    // 20260830: >= 2 personajes registrados validan la cuenta y la promueven).
    function canPublishContent(): boolean {
      if (currentRole === "visitante") {
        return myCharacters.some((c) => c.member_verified);
      }
      return true;
    }
    const PUBLISH_GATE_MSG =
      "Estás en Visitante y tus personajes aún no están validados. Para publicar personajes y bandas, sube el archivo con tus personajes: tu cuenta quedará validada como Miembro y podrás activar su visibilidad pública.";
    // Resuelve cuando loadProfile fija currentRole; personajes/bandas esperan
    // por él para aplicar correctamente el gate de publicación.
    let resolveProfileReady: () => void;
    const profileReady = new Promise<void>((r) => {
      resolveProfileReady = r;
    });

    interface MsgBoxOpts {
      toast?: boolean;
      title?: string;
    }
    function msgBox(id: string, ok: boolean, text: string, opts?: MsgBoxOpts): void {
      const box = document.getElementById(id) as HTMLElement;
      box.textContent = text;
      box.className = `mt-3 ${ui.alert} ${ok ? ui.status.success : ui.status.error}`;
      if (opts?.toast === false) return;
      const title = opts?.title ?? (ok ? "Operación exitosa" : "Ocurrió un error");
      if (ok) toast.success(title, text);
      else toast.error(title, text);
    }

    // Muestra u oculta el enlace al perfil público con un slug conocido o generándolo
    async function syncPublicLink(
      isPublic: boolean | null | undefined,
      knownSlug?: string,
    ): Promise<void> {
      const link = document.getElementById(
        "public-profile-link",
      ) as HTMLAnchorElement;
      if (!isPublic) {
        link.classList.add("hidden");
        return;
      }
      let slug = knownSlug;
      if (!slug) {
        const res = await ensureMyProfileSlug();
        if (res.ok && res.slug) slug = res.slug;
      }
      if (slug) {
        link.href = `/jugador/${slug}`;
        link.classList.remove("hidden");
      }
    }

    // ── Sesión ───────────────────────────────────────────────────────────────
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      window.location.replace("/login?next=%2Fdashboard");
    } else {
      const email = sessionData.session.user.email ?? "";
      accountEmail = email;
      emailEl.textContent = email;
      avatarEl.textContent = (email[0] ?? "?").toUpperCase();

      void loadProfile();
      void loadCharacters();
      void loadHistory();
      void loadGuilds();
      void loadBands();
    }

    // ── Pestañas ─────────────────────────────────────────────────────────────
    // La barra se genera desde src/lib/ui/tabs.ts (contrato único): ids,
    // labels y hashes salen SOLO de ahí. La configuración (#cuenta) NO es un
    // tab: se abre con el engranaje y se resuelve fuera de la barra.
    const panels = DASHBOARD_TABS.map((t) => t.id);

    const tabs = createTabBar({
      tabs: DASHBOARD_TABS,
      barId: "tab-bar",
      defaultId: panels[0],
      variant: "ficha",
      hidePanels: [`panel-${DASHBOARD_CONFIG.id}`],
      resolveHash: (hash) => {
        let id = tabFromHash(hash);
        if (id === "perfil") {
          id = DASHBOARD_CONFIG.id;
          if (window.location.hash !== DASHBOARD_CONFIG.hash) {
            window.history.replaceState(null, "", DASHBOARD_CONFIG.hash);
          }
        }
        if (id === DASHBOARD_CONFIG.id) return null;
        // Subvistas anidadas del tracker (#personajes/ficha/<slug>,
        // #personajes/catalogo): la pestaña activa es el primer segmento; el
        // tracker resuelve la subvista con su propio listener de hash.
        const head = dashboardTabHead(hash);
        const target = panels.includes(head) ? head : id;
        return panels.includes(target) ? target : panels[0];
      },
    });
    document.getElementById("dashboard-tab-dock")?.classList.remove("hidden");
    document.getElementById("tab-bar")?.classList.remove("hidden");

    // "Pestaña oculta" de configuración (seguridad y zona de peligro): desactiva
    // la barra y muestra SOLO su panel. Se abre desde el engranaje del
    // encabezado (DASHBOARD_CONFIG en tabs.ts, hash #cuenta).
    function openConfigPanel(updateHash = true): void {
      tabs.deactivate();
      document
        .getElementById(`panel-${DASHBOARD_CONFIG.id}`)
        ?.classList.remove("hidden");
      if (updateHash) {
        const target = DASHBOARD_CONFIG.hash;
        if (window.location.hash !== target) {
          window.history.replaceState(null, "", target);
        }
      }
    }
    const configBtn = document.getElementById(
      "config-btn",
    ) as HTMLButtonElement | null;
    configBtn?.addEventListener("click", () => openConfigPanel());

    // Deep-link de configuración: #cuenta (el hash histórico #perfil se
    // redirige a #cuenta). La barra ignora ese hash (resolveHash → null).
    function syncConfigFromHash(): void {
      let id = tabFromHash(window.location.hash);
      if (id === "perfil") {
        id = DASHBOARD_CONFIG.id;
        if (window.location.hash !== DASHBOARD_CONFIG.hash) {
          window.history.replaceState(null, "", DASHBOARD_CONFIG.hash);
        }
      }
      if (id === DASHBOARD_CONFIG.id) openConfigPanel(false);
    }
    window.addEventListener("hashchange", syncConfigFromHash);
    syncConfigFromHash();

    document
      .querySelectorAll<HTMLButtonElement>(".goto-btn")
      .forEach((b) =>
        b.addEventListener("click", () =>
          tabs.activate(b.dataset.goto ?? panels[0]),
        ),
      );

    // ── Perfil ───────────────────────────────────────────────────────────────

    // Rellena el <select> del personaje principal SOLO con personajes PÚBLICOS.
    // Incluye la opción "Ninguno" para poder desmarcar el principal.
    function populateMainCharacterSelect(): void {
      const sel = document.getElementById(
        "character-main",
      ) as HTMLSelectElement;
      const hint = document.getElementById(
        "character-main-hint",
      ) as HTMLElement;
      sel.innerHTML = "";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "Ninguno";
      sel.appendChild(none);
      // Solo los personajes habilitados como públicos pueden ser principal: un
      // personaje privado no aparece en la lista ni se puede guardar como tal.
      const publicChars = myCharacters.filter((c) => c.is_public);
      publicChars.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.realm ? `${c.name} · ${c.realm}` : c.name;
        sel.appendChild(opt);
      });
      if (publicChars.length === 0) {
        sel.disabled = true;
        sel.selectedIndex = 0;
        hint.textContent =
          myCharacters.length === 0
            ? "Sube el archivo del addon para detectar tus personajes y elegir tu principal."
            : "Activa la visibilidad pública de al menos un personaje para elegir tu principal.";
        return;
      }
      sel.disabled = false;
      hint.textContent = "Solo puedes elegir entre tus personajes públicos.";
      syncMainCharacterSelect();
    }

    // Preselecciona el personaje guardado SOLO si es PÚBLICO; si el guardado es
    // privado o no existe, queda "Ninguno" seleccionado (opción índice 0).
    // Nunca auto-selecciona un personaje de forma implícita.
    function syncMainCharacterSelect(): void {
      const sel = document.getElementById(
        "character-main",
      ) as HTMLSelectElement;
      if (myCharacters.length === 0) return;
      const match = profileCharacterName
        ? myCharacters.find(
            (c) => c.name.toUpperCase() === profileCharacterName!.toUpperCase(),
          )
        : undefined;
      if (match && match.is_public) {
        sel.value = match.id;
      } else {
        sel.selectedIndex = 0; // "Ninguno"
      }
    }

    async function loadProfile(): Promise<void> {
      const nameInput = document.getElementById(
        "display-name",
      ) as HTMLInputElement;
      const publicToggle = document.getElementById(
        "profile-public",
      ) as HTMLInputElement;

      const res = await getMyProfile();
      if (!res.ok || !res.profile) {
        badgeEl.textContent = "Visitante";
        currentRole = "visitante";
        profilePublic = false;
        refreshHeaderBadges();
        resolveProfileReady();
        return;
      }
      const p = res.profile;
      currentRole = p.role;
      badgeEl.textContent = ROLE_LABELS[p.role] ?? p.role;
      badgeEl.className = `${BADGE_BASE} ${ROLE_STYLES[p.role] ?? ROLE_STYLES.member}`;
      profilePublic = p.is_public === true;
      refreshHeaderBadges();

      if (p.display_name) {
        nameInput.value = p.display_name;
      }

      // Título de la cuenta: nombre visible → handle estable del slug. NUNCA se
      // usa character_name como nombre de cuenta (el "Personaje principal" es
      // solo un dato del perfil, no el nombre visible de la cuenta): las cuentas
      // sin nombre visible caen a su @hex (p. ej. @e3ef4b2).
      const accountTitle =
        (p.display_name ?? "").trim() || handleFromSlug(p.slug);
      const titleEl = document.getElementById("account-title");
      if (titleEl) titleEl.textContent = accountTitle || "Cuenta";
      avatarEl.textContent = (
        accountTitle.replace(/^@/, "")[0] || "?"
      ).toUpperCase();
      profileCharacterName = p.character_name;
      syncMainCharacterSelect();
      publicToggle.checked = p.is_public === true;

      await syncPublicLink(p.is_public, p.slug ?? undefined);
      resolveProfileReady();
    }

    // La visibilidad pública se persiste al instante (no requiere Guardar)
    document
      .getElementById("profile-public")
      ?.addEventListener("change", async (e) => {
        const box = e.target as HTMLInputElement;
        box.disabled = true;
        const res = await updateMyProfile({ is_public: box.checked });
        box.disabled = false;
        if (!res.ok) {
          box.checked = !box.checked;
          msgBox(
            "profile-msg",
            false,
            userError(res.error, "No se pudo cambiar la visibilidad. Inténtalo de nuevo."),
            { title: "Visibilidad del perfil" },
          );
          return;
        }
        profilePublic = box.checked;
        refreshHeaderBadges();
        await syncPublicLink(box.checked);
        msgBox(
          "profile-msg",
          true,
          box.checked ? "Perfil público activado." : "Perfil privado.",
          { title: box.checked ? "Perfil público" : "Perfil privado" },
        );
      });

    document
      .getElementById("save-profile")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById(
          "save-profile",
        ) as HTMLButtonElement;
        const nameInput = document.getElementById(
          "display-name",
        ) as HTMLInputElement;
        const publicToggle = document.getElementById(
          "profile-public",
        ) as HTMLInputElement;
        const charSel = document.getElementById(
          "character-main",
        ) as HTMLSelectElement;
        const selectedChar = myCharacters.find((c) => c.id === charSel.value);

        btn.disabled = true;
        btn.textContent = "Guardando…";
        const res = await updateMyProfile({
          display_name: nameInput.value.trim() || null,
          character_name: selectedChar?.name ?? null,
          is_public: publicToggle.checked,
        });
        btn.disabled = false;
        btn.textContent = "Guardar cambios";

        if (res.ok) {
          profileCharacterName = selectedChar?.name ?? null;
          profilePublic = publicToggle.checked;
          refreshHeaderBadges();
          // Al retirar el nombre visible, el avatar cae al personaje principal o,
          // en su defecto, a la inicial del correo (nunca queda desactualizado).
          const nameSource =
            nameInput.value.trim() || selectedChar?.name || accountEmail || "";
          avatarEl.textContent = nameSource[0]?.toUpperCase() || "?";
          await syncPublicLink(publicToggle.checked);
          msgBox(
            "profile-msg",
            true,
            publicToggle.checked
              ? "Cambios guardados. Tu perfil es público."
              : "Cambios guardados. Tu perfil es privado.",
            { title: "Perfil guardado" },
          );
        } else {
          msgBox(
            "profile-msg",
            false,
            userError(res.error, "No se pudo guardar el perfil. Inténtalo de nuevo."),
            { title: "No se pudo guardar el perfil" },
          );
        }
      });

    // ── Mis Personajes ───────────────────────────────────────────────────────
    // Indicadores del encabezado de Personajes: total y públicos.
    function refreshHdrCharacters(): void {
      const total = myCharacters.length;
      const publics = myCharacters.filter((c) => c.is_public).length;
      setHdrChip("hdr-chars-total", total);
      setHdrChip("hdr-chars-public", publics);
    }

    async function loadCharacters(): Promise<void> {
      await profileReady;
      const statusEl = document.getElementById(
        "characters-status",
      ) as HTMLElement;
      const onboardingEl = document.getElementById(
        "characters-onboarding",
      ) as HTMLElement;
      const emptyEl = document.getElementById(
        "characters-empty",
      ) as HTMLElement;

      // Personajes + notas del juego + estado privado del tracker en paralelo.
      const [res, notesRes, trackerRes] = await Promise.all([
        getMyCharacters(),
        getMyCharacterNotes(),
        getMyTrackerData(),
      ]);
      if (!res.ok) {
        statusEl.textContent = "No se pudieron cargar tus personajes.";
        statusEl.classList.remove("hidden");
        return;
      }
      const rows = res.items ?? [];
      const myNotes = notesRes.ok
        ? (notesRes.notes ?? new Map<string, CharacterNoteData>())
        : new Map<string, CharacterNoteData>();
      const trackerData = trackerRes.ok ? trackerRes.data : undefined;
      const catalog = trackerData?.catalog ?? [];
      const trackerMap = trackerData?.tracker ?? new Map();
      const taskMap = trackerData?.tasks ?? new Map();

      // Modelo del tracker: personaje del SV + estado privado + nota del
      // juego. `myCharacters` comparte los MISMOS objetos para que los
      // interruptores de visibilidad/nota refresquen el perfil y los chips.
      const items: TrackerCharacter[] = rows.map((row) => {
        const meta = trackerMap.get(row.id);
        const tasks = taskMap.get(row.id) ?? { active: [], marked: [] };
        return {
          ...row,
          trackerHidden: meta?.hidden ?? false,
          trackerNote: meta?.note ?? "",
          currencies: meta?.currencies ?? [],
          money: meta?.money ?? 0,
          firstSeen: meta?.first_seen ?? null,
          lastSeen: meta?.last_seen ?? null,
          svSavedAt: meta?.sv_saved_at ?? null,
          addonVersion: meta?.addon_version ?? null,
          tasks,
          gameNote: myNotes.get(row.id)?.note ?? null,
          gameNoteRich: myNotes.get(row.id)?.rich ?? null,
          progress: computeProgress(catalog.length, tasks),
        };
      });
      myCharacters = items;
      refreshHdrCharacters();
      populateMainCharacterSelect();
      emptyEl.classList.toggle("hidden", items.length > 0);
      document
        .getElementById("chars-sectionhead")
        ?.classList.toggle("hidden", items.length === 0);
      document
        .getElementById("chars-sectionbody")
        ?.classList.toggle("hidden", items.length === 0);
      statusEl.classList.add("hidden");
      if (!trackerRes.ok) {
        // El tracker es una capa adicional: si falla, los personajes y el
        // perfil siguen operativos.
        statusEl.textContent = "El tracker no pudo cargar sus datos privados. Recarga la página para reintentar.";
        statusEl.classList.remove("hidden");
      }

      if (!tracker) {
        tracker = initTracker({
          onOwnerChange: () => {
            populateMainCharacterSelect();
            refreshHdrCharacters();
          },
          getCanPublish: () => canPublishContent(),
          onUpload: () => window.location.assign("/upload"),
        });
      }
      tracker.setData(items, catalog);

      if (items.length === 0) {
        return;
      }

      // Onboarding: un Visitante sin personajes validados no puede publicar;
      // el mensaje explica la regla hasta que valide como Miembro.
      if (!canPublishContent()) {
        onboardingEl.classList.remove("hidden");
        onboardingEl.textContent = PUBLISH_GATE_MSG;
      } else {
        onboardingEl.classList.add("hidden");
      }
    }

    // ── Mi Registro: historial + visor del snapshot seleccionado ────────────

    // Contador "Análisis N/total" del selector de análisis (patrón de bandas).
    function updateSvCounter(): void {
      const counter = document.getElementById(
        "sv-counter",
      ) as HTMLElement | null;
      if (!counter) return;
      const total = uploadsCache.length;
      if (total === 0) {
        counter.textContent = "";
        return;
      }
      const idx = currentSvId
        ? uploadsCache.findIndex((u) => u.id === currentSvId) + 1
        : 1;
      counter.textContent = `${idx} de ${total}`;
    }

    function showRegistroEmpty(note?: string): void {
      document.getElementById("registro-empty")?.classList.remove("hidden");
      document.getElementById("registro-main")?.classList.add("hidden");
      const noteEl = document.getElementById(
        "registro-empty-note",
      ) as HTMLElement;
      if (note) {
        noteEl.textContent = note;
        noteEl.classList.remove("hidden");
      } else {
        noteEl.classList.add("hidden");
      }
    }

    function showBandsEmpty(): void {
      // Las bandas se gestionan desde Mis Bandas (loadBands, datos de BD).
      document.getElementById("band-detail")?.classList.add("hidden");
      document.getElementById("band-select-wrap")?.classList.add("hidden");
    }

    async function loadHistory(): Promise<void> {
      const select = document.getElementById("sv-select") as HTMLSelectElement;

      const res = await listMyUploads();
      if (!res.ok) {
        showRegistroEmpty("No se pudo cargar tu historial de análisis.");
        showBandsEmpty();
        return;
      }
      const items = res.items ?? [];
      uploadsCache = items;
      refreshHdrRegistro();

      if (items.length === 0) {
        showRegistroEmpty();
        showBandsEmpty();
        return;
      }

      // Con análisis disponibles: muestra el visor y oculta el estado vacío
      document.getElementById("registro-empty")?.classList.add("hidden");
      document.getElementById("registro-main")?.classList.remove("hidden");

      select.innerHTML = "";
      items.forEach((item, i) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = `${i + 1}. ${svLabel(item)}`;
        select.appendChild(opt);
      });
      select.value = items[0].id;
      updateSvCounter();

      const first = items[0];
      if (first) void renderSnapshot(first.id);
    }

    async function renderSnapshot(svId: string): Promise<void> {
      currentSvId = svId;
      updateSvCounter();
      const res = await getUpload(svId);
      if (!res.ok || !res.item?.raw) return;
      const d = res.item.raw as ParsedSavedVariables;
      const item = uploadsCache.find((u) => u.id === svId);

      // Título del encabezado = título + fecha del análisis seleccionado. Se
      // setea el SPAN interno para preservar el icono "ul" del encabezado.
      const hdrTitle = document.getElementById("hdr-registro-title-text");
      if (hdrTitle) hdrTitle.textContent = item ? svLabel(item) : "Análisis";

      // Cifras del análisis en los chips del encabezado; el visor no repite
      // estadísticas: solo muestra el contenido del registro.
      lastSnapshot = d;
      refreshHdrRegistro();

      // Hermandades del registro (cifras)
      renderGuilds(d);

      // Personajes del registro (fusión player + cuenta + registries) con la
      // card de personaje estandarizada; si el personaje tiene ficha pública,
      // la card enlaza a ella (slug cruzado contra Mis Personajes).
      const slugByKey = new Map<string, string>();
      myCharacters.forEach((mc) => {
        const key = characterListKey(mc.name, mc.realm);
        if (mc.slug) slugByKey.set(key, mc.slug);
      });
      renderRegistryCharacters(collectMergedCharacters(d, slugByKey, myCharacters));

      const leadsAnywhere =
        d.registryGuild?.isGM === true ||
        d.registries.some((r) => r.guild?.isGM === true);
      updateClaimBanner(leadsAnywhere);
    }

    // Personajes del registro: panel de filtros (clase, reino, maestro, otra
    // cuenta, con ficha) + paginador sobre la lista fusionada del snapshot.
    function renderRegistryCharacters(entries: MergedRegistryCharacter[]): void {
      const wrap = document.getElementById("viewer-characters") as HTMLElement;
      const cnt = document.getElementById("cnt-viewer-chars") as HTMLElement;
      const filterEl = document.getElementById("viewer-chars-filtro") as HTMLElement;
      const pagerEl = document.getElementById("viewer-chars-pager") as HTMLElement | null;
      cnt.textContent = `(${entries.length})`;
      filterEl.innerHTML = "";
      if (pagerEl) pagerEl.textContent = "";
      if (entries.length === 0) {
        wrap.innerHTML = "";
        wrap.appendChild(el("p", "text-[11px] text-gray-300 italic", "Sin personajes en el registro."));
        return;
      }

      const facets: Array<Facet<MergedRegistryCharacter>> = [
        {
          id: "clase",
          label: "Filtrar personajes del registro por clase",
          getValues: (e) => (e.character.class ? [e.character.class] : []),
        },
        {
          id: "reino",
          label: "Filtrar personajes del registro por reino",
          getValues: (e) => [(e.character.realm ?? "").trim()].filter(Boolean),
        },
        {
          kind: "flag",
          id: "gm",
          label: "Filtrar personajes maestros de hermandad",
          getFlag: (e) => !!e.character.sv_is_gm,
          chipLabel: "Maestro",
          icon: "estrella",
        },
        {
          kind: "flag",
          id: "otra",
          label: "Filtrar personajes de otra cuenta",
          getFlag: (e) => e.unregistered,
          chipLabel: "Otra cuenta",
          icon: "bloqueo",
        },
        {
          kind: "flag",
          id: "ficha",
          label: "Filtrar personajes con ficha pública",
          getFlag: (e) => !!e.character.slug,
          chipLabel: "Con ficha",
          icon: "enlace",
        },
      ];

      mountPagedList<MergedRegistryCharacter>({
        mount: filterEl,
        items: entries,
        pageSize: PAGE_SIZE_GRID,
        pager: pagerEl,
        container: wrap,
        renderItem: (entry) => renderCharacterCard(entry.character, { forcePlain: true, unregistered: entry.unregistered }),
        getSearchText: (e) => `${e.character.name} ${e.character.realm ?? ""} ${e.character.class ?? ""}`,
        searchPlaceholder: "Buscar personaje del registro…",
        searchLabel: "Buscar personajes del registro por nombre, clase o reino",
        facets,
        resultNoun: (n) => `${n} personaje${n === 1 ? "" : "s"}`,
        emptyMessage: (state) => state.query.trim()
          ? `Ningún personaje coincide con "${state.query.trim()}".`
          : "No hay personajes que coincidan con los filtros.",
      });
    }

    // Hermandades del registro (registry.*.guild): capa fina que conecta el
    // estado del closure (snapshotGmGuilds/updateClaimBanner) con los renderers
    // puros de visitor.ts (collectRegistryGuilds + renderRegistryGuildCards).
    function renderGuilds(d: ParsedSavedVariables): void {
      const wrap = document.getElementById("viewer-guilds") as HTMLElement;
      const filterEl = document.getElementById("viewer-guilds-filtro") as HTMLElement;
      const pagerEl = document.getElementById("viewer-guilds-pager") as HTMLElement | null;
      const guilds = collectRegistryGuilds(d);
      snapshotGmGuilds = guilds.filter((g) => g.isGM).map((g) => g.name);
      updateClaimBanner();
      filterEl.innerHTML = "";
      if (pagerEl) pagerEl.textContent = "";
      if (guilds.length === 0) {
        renderRegistryGuildCards(wrap, []);
        return;
      }

      // Tamaño de hermandad en tramos (dimensión legible en chips).
      const sizeBucket = (g: { numMembers?: number }): string | null => {
        if (typeof g.numMembers !== "number") return null;
        if (g.numMembers <= 10) return "1-10";
        if (g.numMembers <= 25) return "11-25";
        return "26+";
      };
      const facets: Array<Facet<RegistryGuildCard>> = [
        {
          kind: "flag",
          id: "gm",
          label: "Filtrar hermandades donde eres maestro",
          getFlag: (g) => g.isGM,
          chipLabel: "Maestro",
          icon: "estrella",
        },
        {
          id: "rango",
          label: "Filtrar hermandades por tu rango",
          getValues: (g) => [(g.ownRank ?? "").trim()].filter(Boolean),
          minValues: 1,
        },
        {
          id: "tamano",
          label: "Filtrar hermandades por tamaño",
          getValues: (g) => {
            const b = sizeBucket(g);
            return b ? [b] : [];
          },
          labelOf: (v) => `${v} miembros`,
          order: () => ["1-10", "11-25", "26+"],
          minValues: 1,
        },
        {
          kind: "flag",
          id: "personajes",
          label: "Filtrar hermandades con personajes en el registro",
          getFlag: (g) => g.characters.length > 0,
          chipLabel: "Con personajes",
          icon: "personaje",
        },
      ];

      mountPagedList({
        mount: filterEl,
        items: guilds,
        pageSize: PAGE_SIZE_LIST,
        pager: pagerEl,
        clear: () => { wrap.innerHTML = ""; },
        renderPage: (_pageItems, page, filtered) => {
          const start = (page - 1) * PAGE_SIZE_LIST;
          renderRegistryGuildCards(wrap, filtered.slice(start, start + PAGE_SIZE_LIST));
        },
        renderEmpty: (message) => {
          wrap.innerHTML = "";
          wrap.appendChild(el("p", `${ui.text.bodyMuted} italic`, message));
        },
        getSearchText: (g) => `${g.name} ${g.ownRank ?? ""} ${g.characters.join(" ")}`,
        searchPlaceholder: "Buscar hermandad del registro…",
        searchLabel: "Buscar hermandades del registro por nombre, rango o personaje",
        facets,
        resultNoun: (n) => `${n} hermandad${n === 1 ? "" : "es"}`,
        emptyMessage: (state) => state.query.trim()
          ? `Ninguna hermandad coincide con "${state.query.trim()}".`
          : "No hay hermandades que coincidan con los filtros.",
      });
    }

    // Banner de reclamo: si el snapshot acredita liderazgo de alguna hermandad
    // que el usuario aún no ha reclamado (puede ser maestro de varias).
    function updateClaimBanner(leads: boolean | null = null): void {
      if (leads !== null) lastLeads = leads;
      const unclaimed = snapshotGmGuilds.filter(
        (n) =>
          !myGuilds.some(
            (g) => g.name.trim().toLowerCase() === n.trim().toLowerCase(),
          ),
      );
      document
        .getElementById("claim-banner")
        ?.classList.toggle("hidden", !(lastLeads && unclaimed.length > 0));
    }

    const claimBtn = document.getElementById("claim-btn") as HTMLButtonElement;
    claimBtn.addEventListener("click", async () => {
      if (!currentSvId) return;
      claimBtn.disabled = true;
      claimBtn.textContent = "Reclamando…";

      // Promoción pendiente: una cuenta con >= 2 personajes registrados pasa a
      // Miembro en BD. Sin esto, un Visitante que ya cumple la regla chocaría
      // con "Requiere ser Miembro o Maestro" del RPC de reclamo.
      const promo = await tryPromoteMember(currentSvId);
      if (promo.ok && promo.data?.promoted) {
        currentRole = "member";
        badgeEl.textContent = ROLE_LABELS.member ?? "member";
        badgeEl.className = `${BADGE_BASE} ${ROLE_STYLES.member}`;
        refreshHeaderBadges();
        toast.success(
          "Promovido a Miembro",
          "Tu cuenta quedó validada como Miembro.",
        );
      }

      const res = await claimGuildFromSV(currentSvId);
      claimBtn.disabled = false;
      claimBtn.textContent = "Reclamar mis hermandades";
      if (res.ok) {
        msgBox(
          "claim-msg",
          true,
          "¡Hermandad(es) reclamada(s)! Ya eres Maestro: publícalas desde Hermandad.",
          { toast: false },
        );
        toast.success(
          "Hermandad(es) reclamada(s)",
          "Eres maestro; ve a la pestaña Hermandad para publicar tus portales.",
          { duration: 6000 },
        );
        updateClaimBanner(false);
        void loadGuilds();
        void loadProfile();
      } else {
        const err = res.error || "";
        if (err.includes("personaje validado")) {
          msgBox(
            "claim-msg",
            false,
            "Primero valida tu personaje; después podrás reclamar la hermandad.",
            { title: "Reclamo de hermandad" },
          );
        } else if (err.includes("otra cuenta")) {
          msgBox(
            "claim-msg",
            false,
            "Este archivo pertenece a otra cuenta; no puedes reclamar su hermandad desde aquí.",
            { title: "Reclamo de hermandad" },
          );
        } else if (err.includes("Miembro")) {
          msgBox(
            "claim-msg",
            false,
            "Primero valida tu cuenta; después podrás reclamar la hermandad. El reclamo se completará cuando tu cuenta quede validada.",
            { title: "Reclamo de hermandad" },
          );
        } else {
          msgBox("claim-msg", false, userError(err, "No se pudo reclamar la hermandad. Reintenta o contacta a soporte."), {
            title: "Reclamo de hermandad",
          });
        }
      }
    });

    (
      document.getElementById("sv-select") as HTMLSelectElement
    ).addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id) void renderSnapshot(id);
    });

    // ── Eliminar un análisis individual (confirmación modal) ─────────────────
    const svDeleteModal = document.getElementById(
      "sv-delete-modal",
    ) as HTMLElement;
    const svDeleteBtn = document.getElementById(
      "sv-delete-btn",
    ) as HTMLButtonElement;
    const svDeleteLabel = document.getElementById(
      "sv-delete-label",
    ) as HTMLElement;
    const svDeleteMsg = document.getElementById("sv-delete-msg") as HTMLElement;
    const svDeleteCancel = document.getElementById(
      "sv-delete-cancel",
    ) as HTMLButtonElement;
    const svDeleteConfirm = document.getElementById(
      "sv-delete-confirm",
    ) as HTMLButtonElement;

    function closeSvDeleteModal(): void {
      svDeleteModal.classList.add("hidden");
      svDeleteMsg.classList.add("hidden");
      svDeleteConfirm.disabled = false;
      svDeleteConfirm.textContent = "Eliminar";
    }

    svDeleteBtn.addEventListener("click", () => {
      const item = uploadsCache.find((u) => u.id === currentSvId);
      svDeleteLabel.textContent = item ? `"${svLabel(item)}"` : "";
      svDeleteMsg.classList.add("hidden");
      svDeleteConfirm.disabled = false;
      svDeleteConfirm.textContent = "Eliminar";
      svDeleteModal.classList.remove("hidden");
    });

    document
      .getElementById("sv-delete-backdrop")
      ?.addEventListener("click", closeSvDeleteModal);
    svDeleteCancel.addEventListener("click", closeSvDeleteModal);

    svDeleteConfirm.addEventListener("click", async () => {
      if (!currentSvId) {
        closeSvDeleteModal();
        return;
      }
      svDeleteConfirm.disabled = true;
      svDeleteConfirm.textContent = "Eliminando…";
      const res = await deleteMyUpload(currentSvId);
      if (!res.ok) {
        svDeleteConfirm.disabled = false;
        svDeleteConfirm.textContent = "Eliminar";
        svDeleteMsg.className =
          `mt-3 ${ui.alert} bg-red-950/40 border border-red-900/40 text-red-200`;
        const msg = userError(res.error, "No se pudo eliminar el análisis. Inténtalo de nuevo.");
        svDeleteMsg.textContent = msg;
        toast.error(
          "No se pudo eliminar el análisis",
          userError(res.error, "No se pudo eliminar el análisis. Inténtalo de nuevo."),
        );
        return;
      }
      svDeleteMsg.className =
        `mt-3 ${ui.alert} bg-emerald-950/40 border border-emerald-900/40 text-emerald-200`;
      svDeleteMsg.textContent = "Análisis eliminado.";
      toast.success(
        "Análisis eliminado",
        "El archivo seleccionado fue borrado de tu historial.",
      );
      await loadHistory();
      closeSvDeleteModal();
    });

    // Escape cierra el modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !svDeleteModal.classList.contains("hidden")) {
        closeSvDeleteModal();
      }
    });

    // ── Mis Bandas ───────────────────────────────────────────────────────────
    // Las bandas y reglas nacen del SV (el addon es la única fuente; sin
    // formularios). Aquí solo se controla la visibilidad pública de cada una.

    function populateBandSelect(): void {
      const wrap = document.getElementById("band-select-wrap") as HTMLElement;
      const sel = document.getElementById("band-select") as HTMLSelectElement;
      sel.innerHTML = "";
      allBands.forEach((b, i) => {
        const opt = document.createElement("option");
        opt.value = b.id;
        const name = b.name || "Banda sin nombre";
        opt.textContent = b.schedule
          ? `${i + 1}. ${name} · ${b.schedule}`
          : `${i + 1}. ${name}`;
        if (b.id === currentBandId) opt.selected = true;
        sel.appendChild(opt);
      });
      updateBandCounter();
      // Evita listeners duplicados si loadBands corre varias veces.
      sel.replaceWith(sel.cloneNode(true));
      (
        document.getElementById("band-select") as HTMLSelectElement
      ).addEventListener("change", (e) => {
        const id = (e.target as HTMLSelectElement).value;
        currentBandId = id;
        showBandDetail(id);
      });
      wrap.classList.toggle("hidden", allBands.length === 0);
    }

    function updateBandCounter(): void {
      const counter = document.getElementById(
        "band-counter",
      ) as HTMLElement | null;
      if (!counter) return;
      const total = allBands.length;
      if (total === 0) {
        counter.textContent = "";
        return;
      }
      const idx = currentBandId
        ? allBands.findIndex((x) => x.id === currentBandId) + 1
        : 1;
      counter.textContent = `${idx} de ${total}`;
    }

    function showBandDetail(id: string): void {
      const detailEl = document.getElementById("band-detail") as HTMLElement;
      const band = allBands.find((b) => b.id === id);
      if (!band) {
        detailEl.classList.add("hidden");
        updateBandCounter();
        refreshHdrBandSelected();
        return;
      }
      updateBandCounter();
      refreshHdrBandSelected();
      detailEl.innerHTML = "";
      detailEl.classList.remove("hidden");
      detailEl.appendChild(
        renderBandDetail(band, {
          blocked: !canPublishContent(),
          membershipGuilds,
          rulesCatalog,
          onHdrRefresh: refreshHdrBands,
        }),
      );
    }

    // ── Navegador de hermandades (patrón del selector de bandas) ─────────────

    function populateGuildSelect(): void {
      const wrap = document.getElementById("guild-select-wrap") as HTMLElement;
      const sel = document.getElementById("guild-select") as HTMLSelectElement;
      sel.innerHTML = "";
      myGuilds.forEach((g, i) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        const realm = g.realm ? ` · ${g.realm}` : "";
        opt.textContent = `${i + 1}. ${g.name}${realm}`;
        if (g.id === currentGuildId) opt.selected = true;
        sel.appendChild(opt);
      });
      updateGuildCounter();
      // Evita listeners duplicados si loadGuilds corre varias veces.
      sel.replaceWith(sel.cloneNode(true));
      (
        document.getElementById("guild-select") as HTMLSelectElement
      ).addEventListener("change", (e) => {
        const id = (e.target as HTMLSelectElement).value;
        currentGuildId = id;
        showGuildDetail(id);
      });
      wrap.classList.toggle("hidden", myGuilds.length === 0);
    }

    function updateGuildCounter(): void {
      const counter = document.getElementById(
        "guild-counter",
      ) as HTMLElement | null;
      if (!counter) return;
      const total = myGuilds.length;
      if (total === 0) {
        counter.textContent = "";
        return;
      }
      const idx = currentGuildId
        ? myGuilds.findIndex((x) => x.id === currentGuildId) + 1
        : 1;
      counter.textContent = `${idx} de ${total}`;
    }

    function showGuildDetail(id: string): void {
      const cardsEl = document.getElementById("guild-cards") as HTMLElement;
      const guild = myGuilds.find((g) => g.id === id);
      if (!guild) {
        cardsEl.innerHTML = "";
        updateGuildCounter();
        return;
      }
      updateGuildCounter();
      refreshHdrGuild();
      cardsEl.innerHTML = "";
      cardsEl.appendChild(
        renderGuildCard(guild, {
          rulesCatalog,
          refreshHdrGuild,
          guildMembersCount,
          guildBandsCount,
          guildRulesCount,
        }),
      );
    }

    async function loadBands(): Promise<void> {
      await profileReady;
      const selectWrap = document.getElementById(
        "band-select-wrap",
      ) as HTMLElement;
      const detailEl = document.getElementById("band-detail") as HTMLElement;
      const emptyEl = document.getElementById("bands-empty") as HTMLElement;
      const statusEl = document.getElementById("bands-status") as HTMLElement;

      const [res, memRes, rulesRes] = await Promise.all([
        getMyBands(),
        getMyMembershipGuilds(),
        getMyRulesCatalog(),
      ]);
      if (!res.ok) {
        selectWrap.classList.add("hidden");
        detailEl.classList.add("hidden");
        emptyEl.classList.add("hidden");
        statusEl.textContent =
          userError(res.error, "No se pudieron cargar tus bandas. Recarga la página e inténtalo de nuevo.");
        return;
      }
      if (memRes.ok) membershipGuilds = memRes.items ?? [];
      if (rulesRes.ok) rulesCatalog = rulesRes.items ?? [];
      const items = res.items ?? [];
      allBands = items;
      currentBandId = items[0]?.id ?? null;
      const onboardingEl = document.getElementById(
        "bands-onboarding",
      ) as HTMLElement;

      selectWrap.classList.toggle("hidden", items.length === 0);
      emptyEl.classList.toggle("hidden", items.length > 0);
      // Ventana del gestor y empty state son mutuamente excluyentes (modelo de
      // las hermanas): el gestor solo tiene sentido con bandas registradas.
      document
        .getElementById("bands-sectionhead")
        ?.classList.toggle("hidden", items.length === 0);
      document
        .getElementById("bands-sectionbody")
        ?.classList.toggle("hidden", items.length === 0);
      statusEl.textContent = "";
      refreshHdrBands();
      if (items.length > 0) {
        populateBandSelect();
        showBandDetail(currentBandId!);
      } else {
        detailEl.innerHTML = "";
        detailEl.classList.add("hidden");
      }

      // Onboarding: un Visitante sin personajes validados no puede publicar.
      onboardingEl.classList.toggle(
        "hidden",
        !(items.length > 0 && !canPublishContent()),
      );
      onboardingEl.textContent = PUBLISH_GATE_MSG;
    }

    // ── Mi Hermandad ─────────────────────────────────────────────────────────
    // ── Mi Hermandad (multi-hermandad) ───────────────────────────────────────

    async function loadGuilds(): Promise<void> {
      const empty = document.getElementById("guild-empty") as HTMLElement;
      const manage = document.getElementById("guild-manage") as HTMLElement;

      const res = await getMyGuilds();
      if (!res.ok) {
        myGuilds = [];
        updateClaimBanner();
        return;
      }
      const items = res.items ?? [];
      myGuilds = items;
      guildMembersCount.clear();
      guildBandsCount.clear();
      guildRulesCount.clear();
      refreshHdrGuild();
      // El aviso de "bandas sin hermandad" depende de myGuilds: se re-evalúa aquí.
      void loadBands();

      if (items.length === 0) {
        empty.classList.remove("hidden");
        manage.classList.add("hidden");
        updateClaimBanner();
        return;
      }

      empty.classList.add("hidden");
      manage.classList.remove("hidden");
      // Catálogo de reglas para el editor de cada ficha de hermandad (el mismo
      // que usa el panel de bandas: unión de raw.rules de los uploads).
      const rulesRes = await getMyRulesCatalog();
      if (rulesRes.ok) rulesCatalog = rulesRes.items ?? [];
      currentGuildId = items[0]?.id ?? null;
      populateGuildSelect();
      if (currentGuildId) showGuildDetail(currentGuildId);
      updateClaimBanner();
    }

    // ── Seguridad: contraseña y sesión ───────────────────────────────────────
    document
      .getElementById("save-password")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById(
          "save-password",
        ) as HTMLButtonElement;
        const pass = (
          document.getElementById("new-password") as HTMLInputElement
        ).value;
        const confirm = (
          document.getElementById("new-password-confirm") as HTMLInputElement
        ).value;

        const strong =
          pass.length >= 8 && /[a-zA-Záéíóúüñ]/.test(pass) && /\d/.test(pass);
        if (!strong) {
          msgBox(
            "password-msg",
            false,
            "La contraseña debe tener 8+ caracteres con letra y número.",
            { title: "Contraseña no válida" },
          );
          return;
        }
        if (pass !== confirm) {
          msgBox("password-msg", false, "Las contraseñas no coinciden.", {
            title: "Contraseña",
          });
          return;
        }

        btn.disabled = true;
        btn.textContent = "Actualizando…";
        const { error } = await supabase.auth.updateUser({ password: pass });
        btn.disabled = false;
        btn.textContent = "Actualizar contraseña";

        if (error) {
          msgBox(
            "password-msg",
            false,
            userError(error.message, "No se pudo actualizar la contraseña. Inténtalo de nuevo."),
            { title: "No se pudo cambiar la contraseña" },
          );
          return;
        }
        (document.getElementById("new-password") as HTMLInputElement).value =
          "";
        (
          document.getElementById("new-password-confirm") as HTMLInputElement
        ).value = "";
        msgBox("password-msg", true, "Contraseña actualizada correctamente.", {
          title: "Contraseña actualizada",
        });
      });

    document
      .getElementById("logout-btn")
      ?.addEventListener("click", async () => {
        toast.info("Cerrando sesión…", "Nos vemos pronto.");
        await supabase.auth.signOut();
        window.location.assign("/");
      });

    // ── Eliminar cuenta (solo RaidDominion; no toca auth ni otras apps) ────
    const delBtn = document.getElementById(
      "delete-account-btn",
    ) as HTMLButtonElement;
    const delConfirm = document.getElementById(
      "delete-account-confirm",
    ) as HTMLElement;
    const delInput = document.getElementById(
      "delete-account-input",
    ) as HTMLInputElement;
    const delConfirmBtn = document.getElementById(
      "delete-account-confirm-btn",
    ) as HTMLButtonElement;
    const delCancel = document.getElementById(
      "delete-account-cancel",
    ) as HTMLButtonElement;
    const delMsg = document.getElementById("delete-account-msg") as HTMLElement;

    delBtn.addEventListener("click", () => {
      delConfirm.classList.toggle("hidden");
      if (delConfirm.classList.contains("hidden")) {
        delInput.value = "";
        delMsg.classList.add("hidden");
      }
      delConfirmBtn.disabled = true;
    });

    delCancel.addEventListener("click", () => {
      delConfirm.classList.add("hidden");
      delInput.value = "";
      delConfirmBtn.disabled = true;
      delMsg.classList.add("hidden");
    });

    delInput.addEventListener("input", () => {
      delConfirmBtn.disabled =
        delInput.value.trim().toUpperCase() !== "ELIMINAR";
    });

    delConfirmBtn.addEventListener("click", async () => {
      delConfirmBtn.disabled = true;
      delConfirmBtn.textContent = "Eliminando…";
      const res = await deleteMyAccount();
      if (!res.ok) {
        delConfirmBtn.disabled = false;
        delConfirmBtn.textContent = "Confirmar eliminación";
        msgBox(
          "delete-account-msg",
          false,
          userError(res.error, "No se pudo eliminar la cuenta. Inténtalo de nuevo."),
          { title: "Eliminar cuenta" },
        );
        return;
      }
      msgBox("delete-account-msg", true, "Cuenta eliminada. Cerrando sesión…", {
        toast: false,
      });
      toast.info(
        "Cuenta eliminada",
        "Tu cuenta de RaidDominion fue eliminada. Cerrando sesión…",
      );
      await supabase.auth.signOut();
      window.location.assign("/");
    });

    // ── Resetear datos del flujo SV (uploads, personajes, hermandad) ───────
    const resetBtn = document.getElementById(
      "reset-data-btn",
    ) as HTMLButtonElement;
    const resetConfirm = document.getElementById(
      "reset-data-confirm",
    ) as HTMLElement;
    const resetInput = document.getElementById(
      "reset-data-input",
    ) as HTMLInputElement;
    const resetConfirmBtn = document.getElementById(
      "reset-data-confirm-btn",
    ) as HTMLButtonElement;
    const resetCancel = document.getElementById(
      "reset-data-cancel",
    ) as HTMLButtonElement;
    const resetMsg = document.getElementById("reset-data-msg") as HTMLElement;

    resetBtn.addEventListener("click", () => {
      resetConfirm.classList.toggle("hidden");
      if (resetConfirm.classList.contains("hidden")) {
        resetInput.value = "";
        resetMsg.classList.add("hidden");
      }
      resetConfirmBtn.disabled = true;
    });

    resetCancel.addEventListener("click", () => {
      resetConfirm.classList.add("hidden");
      resetInput.value = "";
      resetConfirmBtn.disabled = true;
      resetMsg.classList.add("hidden");
    });

    resetInput.addEventListener("input", () => {
      resetConfirmBtn.disabled =
        resetInput.value.trim().toUpperCase() !== "RESETEAR";
    });

    resetConfirmBtn.addEventListener("click", async () => {
      resetConfirmBtn.disabled = true;
      resetConfirmBtn.textContent = "Reseteando…";
      const res = await resetMyData();
      if (!res.ok) {
        resetConfirmBtn.disabled = false;
        resetConfirmBtn.textContent = "Confirmar reseteo";
        msgBox(
          "reset-data-msg",
          false,
          userError(res.error, "No se pudieron restablecer tus datos. Inténtalo de nuevo."),
          { title: "Resetear datos" },
        );
        return;
      }
      msgBox(
        "reset-data-msg",
        true,
        "Datos reseteados. Recargando tu espacio…",
        { toast: false },
      );
      toast.success(
        "Datos reseteados",
        "Tu historial, personajes y hermandades fueron eliminados. Recargando…",
      );
      resetConfirm.classList.add("hidden");
      resetInput.value = "";
      resetConfirmBtn.disabled = true;
      resetConfirmBtn.textContent = "Confirmar reseteo";
      void loadProfile();
      void loadCharacters();
      void loadHistory();
      void loadGuilds();
      void loadBands();
    });
  