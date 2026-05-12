# TODO - prod-deploy

- [x] Create `scripts/start-prod.ps1` — starts the prod service from the prod dir with PORT=4141
- [x] Update `scripts/build-and-deploy.ps1` to copy `start-prod.ps1` to the prod dir
- [x] Add `"build-and-deploy-prod"` script to root `package.json`
- [x] Run `npm run build-and-deploy-prod` to verify the deploy works end-to-end
- [x] Verify the start script exists in the prod dir after deploy
