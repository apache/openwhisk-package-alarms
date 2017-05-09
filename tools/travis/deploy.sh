#!/bin/bash
set -eu

dockerhub_image_prefix="$1"
dockerhub_image_name="$2"
dockerhub_image_tag="$3"

docker login -u "${DOCKER_USER}" -p "${DOCKER_PASSWORD}"

docker build . --tag "${dockerhub_image_prefix}/${dockerhub_image_name}:${dockerhub_image_tag}" 
docker push "${dockerhub_image_prefix}/${dockerhub_image_name}:${dockerhub_image_tag}"
