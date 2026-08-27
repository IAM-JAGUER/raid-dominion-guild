# Patrones exitosos — RaidDominion Portal

Patrones que funcionan y deben reutilizarse.

## P001: Dashboard con pestañas
- `LayoutDashboard.astro` como wrapper
- Pestañas via `TabNav.astro` + `activeTab` state
- Cada pestaña = componente separado

## P002: Parser de SavedVariables
- `src/lib/parser/savedVariables.ts` — parser estructural (no regex frágil)
- Tipos en `src/types/parser.ts`
- Claves: registry, characters, bands, Guild

## P003: Migraciones Supabase
- Formato `YYYYMMDD_descripcion.sql`
- Todo con prefijo `raiddominion_`
- RLS policies con `auth.uid() = user_id`
- SECURITY DEFINER + SET search_path = ''

## P004: API routes en Astro
- `src/pages/api/*.ts` para endpoints
- Middleware para auth (`src/middleware.ts`)
- Supabase client en `src/lib/supabase.ts`

## P005: Build serializado
- `scripts/verifica.sh` con lock global
- Nunca `npx astro build` directo
- Sandbox ext4 para builds rápidos

## P006: Contrato SV addon ↔ portal
- Parser en `savedVariables.ts`
- Addon escribe en `RD_Utils_Registry.lua`
- Sincronía obligatoria al cambiar claves

## P007: Tema WoW (ámbar/dorado)
- Tokens en `src/lib/ui/design.ts`
- Importar tokens, no duplicar literales
- `rounded-lg` para elementos con texto
- `rounded-full` solo para elementos sin texto

## P008: Multi-app Supabase
- `../supabase-shared/` NO modificar
- `handle_new_user()` canónica
- Tablas sin prefijo NO tocar
- `raiddominion_profiles.role` = fuente de verdad
