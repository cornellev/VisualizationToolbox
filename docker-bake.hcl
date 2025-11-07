variable "REGISTRY" {
  default = "ghcr.io/cornellev"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["nginx", "server", "client", "worker"]
}

target "nginx" {
  context   = "./nginx"
  tags      = ["${REGISTRY}/viz-nginx:${TAG}"]
  platforms = ["linux/amd64"]
  push      = true
}

target "server" {
  context   = "./server"
  tags      = ["${REGISTRY}/viz-server:${TAG}"]
  platforms = ["linux/amd64"]
  push      = true
}

target "client" {
  context   = "./client"
  tags      = ["${REGISTRY}/viz-client:${TAG}"]
  platforms = ["linux/amd64"]
  push      = true
}

target "worker" {
  context   = "./pyworker"
  tags      = ["${REGISTRY}/viz-worker:${TAG}"]
  platforms = ["linux/amd64"]
  push      = true
}
