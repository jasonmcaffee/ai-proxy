We run prod services by copying them to C:\jason\dev\prod.

We want prod to run on port 4141, and local dev and tests to test against 4142.  

We want a build-and-deploy script that builds the production build and copies it to the prod folder.  
The build and deploy should stop the prod service after build completes, move the files, then start the service for prod.

add a stop-service-prod to kill 4141, and update stop-service to kill 4142.