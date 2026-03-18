# Contribution guidelines

Before you make your changes, check to see if an [issue exists](https://github.com/dfinity/icp-js-core/issues). If there isn't one, you can [create one](https://github.com/dfinity/icp-js-core/issues/new/choose) to discuss your proposed changes.

## Development Setup

### Getting Started

1. Clone the repository
2. Install Node.js version specified in `.node-version`
3. Run `corepack enable` to enable `pnpm`
4. Run `pnpm install` to install dependencies
5. Run `pnpm build` to build all packages

### Running Tests

- **Unit tests**: `pnpm test`
- **E2E tests**: First run setup in the e2e folder, then run tests:
  ```bash
  pnpm build
  cd e2e/node
  pnpm run setup
  pnpm e2e
  ```

## Forking the repository

We use the [GitHub forking workflow](https://help.github.com/articles/fork-a-repo/) to manage contributions to this project. Please follow the steps below to create your own fork of this repository.

https://docs.github.com/en/get-started/quickstart/fork-a-repo#fork-an-example-repository

Once you have forked the repository, you can clone it to your local machine.

## Making Changes

Create a branch that is specific to the issue you are working on. If you have a GitHub Issue, use the issue number in the branch name. For example,

```text
555-add-a-new-feature
```

Once you have a branch, you can make your changes and commit them to your local repository. In your commit message, please include a reference to the GitHub issue you are working on, formatted using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/#examples). For example,

```text
feat: adds a new feature
Closes #555
additional detail if necessary
```

This will automatically link your commit to the GitHub issue, and automatically close it when the pull request is merged.

The changelog is automatically generated from conventional commit messages — you do not need to update it manually.

## Formatting

To save time on formatting, we use automated formatting for this repo using prettier. You can either use git pre-commit hooks or run the command `pnpm prettier:format` before submitting your PR to have your changes pass. We check formatting on CI.

## Continuous Integration (CI)

Changes will have to pass automated tests before they can be merged. If your changes fail the tests, you will have to address the failures and re-run the tests.

GitHub Actions for this repo are configured in [./workflows](./workflows).

- [conventional-commits.yml](./workflows/conventional-commits.yml) - checks the title of pull requests to ensure they follow a specified format.
- [create-release-pr.yml](./workflows/create-release-pr.yml) - creates a release PR by bumping versions using commitizen and opening a PR. Triggered manually via workflow dispatch.
- [docs.yml](./workflows/docs.yml) - builds the documentation site to verify it compiles correctly.
- [e2e-tests.yml](./workflows/e2e-tests.yml) - runs end-to-end tests for the project.
- [generate-changelog.yml](./workflows/generate-changelog.yml) - automatically generates the changelog based on conventional commits when changes are pushed to main.
- [lint.yml](./workflows/lint.yml) - checks the code for linting errors.
- [mitm.yml](./workflows/mitm.yml) - sets up a Man-in-the-Middle (MITM) proxy for testing purposes.
- [npm-audit.yml](./workflows/npm-audit.yml) - runs `pnpm audit` to check for known vulnerabilities in dependencies.
- [prettier.yml](./workflows/prettier.yml) - checks the formatting of the code using Prettier.
- [publish-docs.yml](./workflows/publish-docs.yml) - builds and publishes documentation to the [ICP JS SDK Docs](https://github.com/dfinity/icp-js-sdk-docs) repository. Can be triggered manually or called by the release workflow.
- [release.yml](./workflows/release.yml) - publishes the package to npm and creates a GitHub release. Triggered when a version tag is pushed (e.g., `v5.1.0`).
- [size-limit.yml](./workflows/size-limit.yml) - uses the `andresz1/size-limit-action` action to calculate the size of the project.
- [unit-tests.yml](./workflows/unit-tests.yml) - runs unit tests for the project.

## Reviewing

A member of the team will review your changes. Once the member has reviewed your changes, they will comment on your pull request. If the member has any questions, they will add a comment to your pull request. If the member is happy with your changes, they will merge your pull request.

## Main Branch Conventions

All commits in the main branch should come from squashed GitHub Pull Requests, and those commit messages should follow the [conventionalcommits.org](https://conventionalcommits.org) syntax.

## Documentation

The documentation website is built using [Starlight](https://starlight.astro.build) and deployed to the [ICP JS SDK Docs](https://github.com/dfinity/icp-js-sdk-docs).

To test the documentation website locally, you can run the following commands:

```shell
pnpm start
# or
pnpm preview
```

# Release new version and Publish it to NPM

## Release process

We use [commitizen](https://commitizen-tools.github.io/commitizen/) and shared [dfinity/ci-tools](https://github.com/dfinity/ci-tools) actions to automate the release process. The version is automatically determined from conventional commit messages.

### Step 1: Create a release PR

Start the process by triggering the `create-release-pr` workflow. This can be done by:

- Navigating to the GitHub web UI and clicking "Run workflow" at https://github.com/dfinity/icp-js-core/actions/workflows/create-release-pr.yml, or
- Running this command from your console:
  ```shell
  gh workflow run "create-release-pr.yml"
  ```
  For a beta release:
  ```shell
  gh workflow run "create-release-pr.yml" -f "beta_release=true"
  ```

The workflow will:

- Determine the next version from conventional commits
- Bump the version in `packages/core/package.json`
- Update the changelog
- Create a `release/v<version>` branch and open a PR to `main`

### Step 2: Review and merge the PR

Review the release PR and merge it into `main`.

### Step 3: Tag and publish

After merging, tag the merge commit to trigger the release:

```shell
git checkout main && git pull
git tag v<version>
git push origin v<version>
```

This triggers the [`release.yml`](./workflows/release.yml) workflow, which:

- Publishes `@icp-sdk/core` to npm (with provenance)
- Creates a GitHub Release with auto-generated release notes
- Publishes documentation (for non-beta releases)

<details>
<summary>
  How to manually publish to NPM (without utilizing the release workflow)?
</summary>

Perform the following steps to manually publish a package to NPM:

1. Create a branch and execute these commands:
   - `git clean -dfx`. This removes all non-tracked files and directories.
   - `pnpm i`. This ensures everything is installed and up-to-date locally.
   - `pnpm build`. This builds all applications and packages.
2. Initiate a new release branch using `git checkout -b release/v<#.#.#>`.
3. Stage your changes with `git add .`.
4. Create a commit including your changes using `git commit -m 'chore: release v<#.#.#>'`.
5. Open a pull request from your fork of the repository.

Once the changes are merged, you can publish to NPM by running:

- `pnpm build`. Re-building for safety.
- `pnpm -F './packages/core' publish --access public`.
  - To do this, you will need publishing authorization under our NPM organization. Contact IT if you require access.
  - You can include the `--dry-run` flag to verify the version before actual publishing.

After publishing to NPM, go to https://github.com/dfinity/icp-js-core/releases/new, select "Draft a new release", enter the new tag version (in `v#.#.#` format), and click "Publish release".

</details>

## Publishing Documentation

Docs are automatically built and a PR is opened in the docs repo as part of the [`release.yml`](./workflows/release.yml) workflow for non-beta releases. The PR still needs to be reviewed and merged manually. The [`publish-docs.yml`](./workflows/publish-docs.yml) workflow can also be triggered manually if needed.

<details>
<summary>
  How to manually publish a new version of the documents?
</summary>

You can trigger the `publish-docs` workflow manually from the GitHub Actions UI or via the CLI:

```shell
gh workflow run "publish-docs.yml" -f "ref=v5.0.0"
```

Alternatively, to build and publish docs entirely manually:

1. Start with a fresh clone (or execute `git clean -dfx .`) to ensure no untracked files are present.
2. Run `pnpm i` to install all dependencies.
3. Move to the [`docs`](../docs/) directory.
4. Build the docs setting the proper environment variables:
   ```shell
   DOCS_VERSION=v5.0 pnpm build
   ```
5. The built docs will be in `docs/dist/v5.0/`. Follow the [ICP JS SDK Docs](https://github.com/dfinity/icp-js-sdk-docs) repository instructions to deploy.

</details>

# Deprecation

To deprecate a package, follow these steps

- Add a note to the README saying `**Warning** this package is deprecated`
- Increment the patch version of the package in its `package.json` file
- Release the patched version of the package to NPM
- Deprecate the package in NPM with `npm deprecate ...`
- Remove the package from the root [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) file
- Optionally, remove all contents except the package.json, license, and readme. This can be done later, so that the source code stays available for reference for a while.
