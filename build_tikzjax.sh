#!/usr/bin/env bash

docker compose up --build -d

mkdir -p output
docker compose cp develop:/code/tikzjax/dist/fonts.css ./output
docker compose cp develop:/code/tikzjax/dist/tikzjax.js ./output

mkdir -p tex_files
docker compose cp develop:/code/tikzjax/tex_files .

docker compose down