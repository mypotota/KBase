# shadcn/ui component provenance

Official repository: https://github.com/shadcn-ui/ui

Pinned commit: `96da9cc7f1aa10580a3741664e2a77c721206c00`

Source directory: `apps/v4/registry/new-york-v4/ui/`

Components in `src/components/ui` were downloaded from that exact commit. The only integration changes are import aliases: upstream `cn` → `@/lib/utils`, and registry component imports → `@/components/ui`.

The official registry host `ui.shadcn.com` returned a proxy 403 in this environment. Component source was retrieved over verified HTTPS from the official GitHub repository instead. These are actual shadcn/ui components, built on Radix UI; they are not visual imitations. The MIT license is retained as `SHADCN-LICENSE`.

Future supported registry updates can use `npx shadcn@latest add <component>` from `web/`, when registry access is available.
