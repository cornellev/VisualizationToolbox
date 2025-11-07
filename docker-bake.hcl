variable "REGISTRY" { default = "ghcr.io/cornellev" }
variable "TAG"      { default = "latest" }

group "default" {
  targets = ["server", "client", "worker"]
}

target "server" {
  context   = "./server"
  tags      = ["${REGISTRY}/viz-server:${TAG}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}

target "client" {
  context   = "./client"
  tags      = ["${REGISTRY}/viz-client:${TAG}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}

target "worker" {
  context   = "./pyworker"
  tags      = ["${REGISTRY}/viz-worker:${TAG}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}
