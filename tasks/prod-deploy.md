We want to create a deploy script to build a production version of the app (frontend/backend/etc).
We want a dist version of the app put in a subfolder in C:\jason\dev\prod.
We want a start-prod script that starts the service(s) from that prod dir.
The start script should also have env vars set for the port(s) that the service(s) run on.
We also want in the root dir a package.json script named "build-and-deploy-prod" that builds and moves everything to the
prod dir subfolder for the project.