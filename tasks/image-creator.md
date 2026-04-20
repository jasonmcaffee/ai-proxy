We want to implement a images.controller.ts.

We want the api, url, generated client, etc to mirror openai's sdk.

We use ComfyUI server, which runs on localhost:8083 to generate images.

research C:\jason\dev\ang\src\workflows.  
we want to have a workflow similar to the createImageZibZitWorkflow.ts which uses the jason-moody-zib-zit.json workflow to send to comfyui.
Look at how the app/api/images/createImageZibZit does things.
We want to generate the image, wait for the image generation to complete (can take 30-180 seconds or more), and return that in the same format openai sdk expects.
We don't care about loras.  

We don't need retry.  Sometimes comfyui isn't running, so we can just return a 500 if thats the case.

lets have a model mapping plan, and for now, regardless of what model is passed in, just use "zib-zit-moody", and map to the workflow.

openai sdk doesn't support negativePrompt, but we want our sdk to allow for it, so add it to our client, endpoint, etc as optional.

all the logic should be put in services/imageCreator and models/imageCreator folders.  The controller should just abstract away http logic, and forward the call to the imageCreator.service.ts.

we want a new integration test suite for images, and to confirm we are getting back valid images.