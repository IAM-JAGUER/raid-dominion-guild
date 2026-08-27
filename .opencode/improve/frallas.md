# Frallas conocidas — RaidDominion Portal

Problemas encontrados y cómo evitarlos.

## F001: Build falla por Browser API en SSR
- **Error**: `document` o `window` en componente server-side
- **Solución**: Usar `client:only` o lifecycle methods
- **Detección**: verifica.sh falla con "Browser APIs are not available on the server"

## F002: RLSolicies sin prefijo
- **Error**: CREATE POLICY sin raiddominion_
- **Solución**: Siempre prefijo raiddominion_
- **Detección**: audita-ecosistema.sh

## F003: handle_new_user() modificado
- **Error**: Editar la función canónica en supabase-shared
- **Solución**: Coordinar con las 5 apps
- **Detección**: audita-ecosistema.sh

## F004: officerNote expuesta
- **Error**: Mostrar officerNote en páginas públicas
- **Solución**: Solo publicNote en público
- **Detección**: audita-ecosistema.sh

## F005: Contrato SV roto
- **Error**: Cambiar claves del parser sin actualizar addon
- **Solución**: Coordinar addon↔portal en mismo ciclo
- **Detección**: contract-test.sh

## F006: any en TypeScript
- **Error**: Usar `: any` o `as any`
- **Solución**: Tipar correctamente
- **Detección**: audita-ecosistema.sh

## F007: Build paralelo en DrvFs
- **Error**: Múltiples builds simultáneos
- **Solución**: usa scripts/verifica.sh (lock global)
- **Consecuencia**: Corrupción de dist/

## F008: Tablas compartidas modificadas
- **Error**: ALTER TABLE en apps o user_apps
- **Solución**: NO modificar tablas sin prefijo
- **Detección**: audita-ecosistema.sh
