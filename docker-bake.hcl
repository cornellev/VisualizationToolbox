variable "REGISTRY" { default = "ghcr.io/cornellev" }
variable "TAG"      { default = "latest" }

group "default" {
  targets = ["server", "client", "worker"]
}

target "server" {
  context   = "./server"
  tags      = [for t in split(",", TAG) : "${REGISTRY}/viz-server:${t}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}

target "client" {
  context   = "./client"
  tags      = [for t in split(",", TAG) : "${REGISTRY}/viz-client:${t}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}

target "worker" {
  context   = "./pyworker"
  tags      = [for t in split(",", TAG) : "${REGISTRY}/viz-worker:${t}"]
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/cornellev/VisualizationToolbox"
  }
  push      = true
}
