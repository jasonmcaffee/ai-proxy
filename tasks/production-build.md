We run prod services by copying them to C:\jason\dev\prod.

We want prod to run on port 4141, and local dev and tests to test against 4142.  

We want a simple build-and-deploy script that builds the production build and copies it to the prod folder.  