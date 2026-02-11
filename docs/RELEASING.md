# Releasing ChartGPU

This document describes how to create a new release of ChartGPU.

## Versioning

ChartGPU follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (`x.0.0`): Breaking API changes
- **MINOR** (`0.x.0`): New features, backward-compatible
- **PATCH** (`0.0.x`): Bug fixes, backward-compatible

## Release Checklist

### 1. Prepare the release

- [ ] Ensure all tests pass: `npm run test`
- [ ] Update version in `package.json`
- [ ] Update version in `packages/github/package.json` to match
- [ ] Move `[Unreleased]` entries in `CHANGELOG.md` under a new version heading
- [ ] Update the `[Unreleased]` comparison link in `CHANGELOG.md`
- [ ] Commit: `git commit -m "chore: prepare release vX.Y.Z"`

### 2. Tag and push

```bash
git tag vX.Y.Z
git push origin main --tags
```

### 3. Create the GitHub Release

1. Go to [Releases](https://github.com/chartgpu/chartgpu/releases/new)
2. Select the tag `vX.Y.Z`
3. Set the title to `vX.Y.Z`
4. Click "Generate release notes" (uses `.github/release.yml` categories)
5. Review and edit the generated notes:
   - Add a brief summary at the top (1-2 sentences on what's notable)
   - Include screenshots or GIFs for visual changes (upload to the release or reference `docs/assets/`)
   - Highlight any breaking changes prominently
6. Publish the release

### 4. Automated publishing

When a release is published:

- **GitHub Packages**: The `publish-github-packages.yml` workflow automatically builds and publishes `@chartgpu/chartgpu` to GitHub Packages.
- **npm**: Publish manually via `npm publish` (ensure you're logged in with `npm login`).

### 5. Post-release

- [ ] Verify the npm package: `npm info chartgpu`
- [ ] Verify the GitHub Package appears in the repo sidebar
- [ ] Announce on GitHub Discussions (Show & Tell thread)
- [ ] Update any pinned Discussions threads if the release includes roadmap items

## Release Notes Best Practices

### Include visuals for UI changes

For any release that changes visual behavior (new chart types, animation changes, theme updates), include:

- A screenshot or GIF demonstrating the change
- Store assets in `docs/assets/` and reference them in the release notes
- Use descriptive alt text

### Structure

```markdown
## What's New

Brief summary of the release (1-2 sentences).

### New Features
- Feature description with link to docs/example

### Bug Fixes
- Fix description with link to issue

### Breaking Changes
- Description of what changed and migration steps

### Screenshots

![Description](docs/assets/screenshot.png)
```

### Link to resources

- Link to relevant documentation pages
- Link to example pages demonstrating new features
- Link to issues that were closed

## Automated Release Notes

The `.github/release.yml` file configures automatic categorization of PRs in release notes:

| Label | Category |
|-------|----------|
| `enhancement`, `feature` | New Features |
| `bug`, `bugfix`, `fix` | Bug Fixes |
| `performance`, `optimization` | Performance |
| `documentation`, `docs` | Documentation |
| `breaking-change`, `breaking` | Breaking Changes |

PRs with `skip-changelog` or `dependencies` labels are excluded from generated notes.
