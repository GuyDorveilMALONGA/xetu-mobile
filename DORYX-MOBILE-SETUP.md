# Doryx Mobile Setup

Date: 2026-06-24
Repo: `C:\Users\DELL\Desktop\xetu-mobile`
Rollback tag: `pre-doryx-mobile-2026-06-24`

## Etat fige

Doryx est installe dans le repo Expo mobile, separe du Doryx backend.

- Version Doryx: `doryx-mcp@0.2.0`
- Source: `file:../Le manifeste Doryx/doryx-mcp-0.2.0.tgz`
- Commit de cablage: `b56e51e chore: wire Doryx MCP`
- Branche: `master`

## Fichiers de cablage

- `package.json`: dependance `doryx-mcp` et script `doryx:server`
- `package-lock.json`: lock npm mis a jour
- `.mcp.json`: serveur MCP `doryx` pointe vers ce repo mobile
- `.gitignore`: ignore `.doryx/` et `.doryx-backups/`

Le serveur MCP configure:

```json
{
  "mcpServers": {
    "doryx": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\Users\\DELL\\Desktop\\xetu-mobile\\node_modules\\doryx-mcp\\dist\\src\\index.js"
      ],
      "env": {
        "DORYX_PROJECT_ROOT": "C:\\Users\\DELL\\Desktop\\xetu-mobile"
      }
    }
  }
}
```

## Commandes utiles

Demarrer le serveur Doryx:

```powershell
cd C:\Users\DELL\Desktop\xetu-mobile
npm run doryx:server
```

Verifier l'installation:

```powershell
node -e "const p=require('./node_modules/doryx-mcp/package.json'); console.log(p.name + '@' + p.version)"
```

Verifier Hindsight / Nexus Memory:

```powershell
node node_modules\doryx-mcp\dist\src\index.js hindsight-doctor --json
node node_modules\doryx-mcp\dist\src\index.js memory-sync --dry-run --json
node node_modules\doryx-mcp\dist\src\index.js nexus-recall --query "xetu-mobile" --json
```

Rollback complet avant Doryx:

```powershell
cd C:\Users\DELL\Desktop\xetu-mobile
git reset --hard pre-doryx-mobile-2026-06-24
```

## Verifications executees

- `npx.cmd tsc --noEmit`: OK
- `npx.cmd expo config --type public`: OK
- Presence de `.mcp.json`: OK
- Presence de `node_modules/doryx-mcp/dist/src/index.js`: OK
- `doryx hindsight-setup`: OK, Hindsight active sur `http://localhost:8888`, banque `doryx-xetu-mobile`, secret reference par nom `DEEPSEEK_API_KEY` uniquement.
- `doryx hindsight-doctor`: OK, Docker/Hindsight joignables, API key env presente sans valeur affichee.

## Notes

`.doryx/` est volontairement ignore par git. Si Doryx cree un etat local pour le mobile, il ne doit pas etre confondu avec l'etat Doryx du backend `whatsapp-agent`.

Nexus Memory/Hindsight est une memoire longue proof-linked, pas une autorite de verite. Doryx reste l'autorite; ne synchroniser que les faits qualifies par verification/revue.

`npm install` a signale 10 vulnerabilites moderees. Aucun `npm audit fix` n'a ete lance, pour eviter des changements de versions non lies au cablage Doryx.
