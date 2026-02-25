## Local Development Quick-Start

Hey, we're using Postgres for the database and Vertex AI for the agent. I've set up a fully local Docker sandbox for you so you don't need my cloud credentials. 

Just run `docker-compose up --build`. 

It will spin up the Next.js app, a local Postgres DB, and a local AI model (via Ollama/LiteLLM) that perfectly mimics the Vertex API. 

*Note: the first time you run it, it might take a few minutes to download the AI model.*
