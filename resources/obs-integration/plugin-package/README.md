# Native plugin package contract

The staging tool accepts either a directory or ZIP with this OBS-native layout:

```text
package-root/
  obs-plugin-package.json       optional, recommended
  obs-plugins/
    64bit/
      ilyStream-obs.dll         required
      ilyStream-obs.pdb         optional
  data/
    obs-plugins/
      ilyStream-obs/            optional runtime data
        locale/
        ...
```

`obs-plugin-package.json` follows [`obs-plugin-package.schema.json`](./obs-plugin-package.schema.json). The DLL basename, manifest `pluginId`, binary filename, and plugin data-directory name must match. The plugin ID must begin with `ilyStream` (case-insensitive).

The stage script deliberately ignores package-root documentation and copies only the matching DLL/PDB and matching `data/obs-plugins/<pluginId>/` tree. It rejects absolute paths, traversal, reparse points, multiple matching DLLs, and files outside that allowlist. Every staged file is SHA-256 verified and recorded in `ilyStream-stage.json`.

This legacy-shaped package tree is an input/staging contract, not the default live destination. At apply time, a standard Windows installation maps it to OBS's recommended per-plugin tree under `%ProgramData%\obs-studio\plugins\<pluginId>\bin\64bit` and `<pluginId>\data`. Portable or explicitly root-relative installs preserve the package paths under the selected OBS root. Existing schema-v1 stages remain installable.

Staging never writes into OBS. Applying a stage is a separate command that refuses to run while the selected OBS executable is active.
