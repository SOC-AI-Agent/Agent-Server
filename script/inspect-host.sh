#!/bin/sh
# What this host has and how much of it is in use — CPU, GPU, RAM, storage —
# and where the model cache sits and what shares its disk. Read-only.
#
#   sh script/inspect-host.sh
#
# Run by the inspect_host job. CPU and RAM come from /proc, which a container
# shares with the host: they are the host's figures, not this job's. GPUs from
# the PCI devices in /sys, and from nvidia-smi when the host has the NVIDIA
# driver. Storage twice: the model cache's own disk, from a throwaway container
# with that directory mounted read-only; then the host's whole view of its
# disks — df, lsblk, LVM — in the host's mount namespace, from a privileged
# throwaway container, the way inspect-ports.sh reads firewalld (a container
# sees only its own filesystems).

set -u

PROBE_IMAGE="${CI_JOB_IMAGE:-docker:latest}"

# GitLab collapsible log sections; plain headings anywhere else.
section() { printf '\n\033[0Ksection_start:%s:%s[collapsed=%s]\r\033[0K== %s ==\n' "$(date +%s)" "$1" "$2" "$3"; }
end_section() { printf '\033[0Ksection_end:%s:%s\r\033[0K\n' "$(date +%s)" "$1"; }

# kB -> "12.3 GB"
gb() { awk -v k="$1" 'BEGIN { printf "%.1f GB", k / 1048576 }'; }
pct() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.0f%%", b ? 100 * a / b : 0 }'; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# ── Gather ───────────────────────────────────────────────────────────────────

IFS='|' read -r host_name os kernel docker_root <<EOF
$(docker info -f '{{.Name}}|{{.OperatingSystem}}|{{.KernelVersion}}|{{.DockerRootDir}}' 2>/dev/null)
EOF
up_days=$(awk '{ printf "%.0f", $1 / 86400 }' /proc/uptime)

cpu_model=$(awk -F': *' '/^model name/ { print $2; exit }' /proc/cpuinfo)
cores=$(grep -c '^processor' /proc/cpuinfo)
sockets=$(awk -F': *' '/^physical id/ { s[$2] = 1 } END { n = 0; for (k in s) n++; print n }' /proc/cpuinfo)
# Busy share of all cores over two seconds: user..steal, idle and iowait apart.
ticks() { awk '/^cpu / { t = 0; for (i = 2; i <= 9; i++) t += $i; print t, $5 + $6 }' /proc/stat; }
t1=$(ticks); sleep 2; t2=$(ticks)
cpu_busy=$(echo "$t1 $t2" | awk '{ dt = $3 - $1; di = $4 - $2; printf "%.0f%%", dt ? 100 * (dt - di) / dt : 0 }')
read -r load1 load5 load15 _ < /proc/loadavg

mem() { awk -v k="$1:" '$1 == k { print $2 }' /proc/meminfo; }
mem_total=$(mem MemTotal); mem_avail=$(mem MemAvailable)
swap_total=$(mem SwapTotal); swap_free=$(mem SwapFree)
mem_used=$((mem_total - mem_avail)); swap_used=$((swap_total - swap_free))

# Display and 3D controllers (PCI class 03xx). Only NVIDIA and AMD are GPUs
# llama.cpp could run a model on; the rest drive a screen.
gpus=""; compute=""
for d in /sys/bus/pci/devices/*; do
  [ -r "$d/class" ] || continue
  case "$(cat "$d/class")" in 0x03*) ;; *) continue ;; esac
  case "$(cat "$d/vendor")" in
    0x10de) name="NVIDIA"; compute=yes ;;
    0x1002) name="AMD"; compute=yes ;;
    0x8086) name="Intel graphics" ;;
    0x15ad) name="VMware virtual display" ;;
    0x1234) name="QEMU virtual display" ;;
    0x1af4) name="virtio virtual display" ;;
    0x1414) name="Hyper-V virtual display" ;;
    0x1a03) name="ASPEED server display" ;;
    0x102b) name="Matrox server display" ;;
    *) name="display $(cat "$d/vendor"):$(cat "$d/device")" ;;
  esac
  gpus="${gpus:+$gpus, }$name"
done
llama_image=$(docker inspect -f '{{.Config.Image}}' dall-m-llamacpp 2>/dev/null)
case "$llama_image" in
  "") llama_build="not running" ;;
  *cuda*|*rocm*|*vulkan*|*musa*|*intel*) llama_build="GPU build" ;;
  *) llama_build="CPU build: runs on the CPU even with a GPU present" ;;
esac

# The model cache's directory on the host: where dall-m-llamacpp has /models
# mounted from, or where docker compose puts ./data/models.
models=""
for c in dall-m-llamacpp dall-m-model-preload dall-m-server; do
  models=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/models"}}{{.Source}}{{end}}{{end}}' "$c" 2>/dev/null)
  [ -n "$models" ] && break
done
[ -n "$models" ] || models="${CI_PROJECT_DIR:-.}/data/models"

# "device size_kB used_kB free_kB mountpoint content_kB" for a host directory.
# --mount, unlike -v, does not create a directory that is not there.
disk_of() {
  docker run --rm --mount "type=bind,source=$1,target=/probe,readonly" --entrypoint sh "$PROBE_IMAGE" -c \
    'df -P -k /probe | awk "NR == 2 { printf \"%s %s %s %s \", \$1, \$2, \$3, \$4 }"; du -sk /probe 2>/dev/null | cut -f1' 2>/dev/null
}
models_disk=$(disk_of "$models")
docker_disk=$(docker run --rm --mount "type=bind,source=$docker_root,target=/probe,readonly" --entrypoint df "$PROBE_IMAGE" -P -k /probe 2>/dev/null \
  | awk 'NR == 2 { print $1, $2, $3, $4 }')

# ── Summary ──────────────────────────────────────────────────────────────────

section summary false "Host: $host_name"
printf '%-9s %s, kernel %s, up %s days\n' "OS" "${os:-?}" "${kernel:-?}" "$up_days"
printf '%-9s %s cores%s%s\n' "CPU" "$cores" "$([ "$sockets" -gt 0 ] && echo " on $sockets socket(s)")" "${cpu_model:+, $cpu_model}"
printf '%-9s in use %s, load %s / %s / %s (1 / 5 / 15 min; %s cores = fully busy)\n' "" "$cpu_busy" "$load1" "$load5" "$load15" "$cores"
if [ -n "$compute" ]; then
  printf '%-9s %s\n' "GPU" "$gpus"
else
  printf '%-9s none that can run a model%s\n' "GPU" "${gpus:+ — display only: $gpus}"
fi
printf '%-9s llama.cpp: %s (%s)\n' "" "${llama_image:--}" "$llama_build"
printf '%-9s %s total, used %s (%s), available %s\n' "RAM" "$(gb "$mem_total")" "$(gb "$mem_used")" "$(pct "$mem_used" "$mem_total")" "$(gb "$mem_avail")"
printf '%-9s swap: %s of %s used\n' "" "$(gb "$swap_used")" "$(gb "$swap_total")"
if [ -n "$models_disk" ]; then
  set -- $models_disk
  printf '%-9s model cache %s holds %s\n' "Storage" "$models" "$(gb "${5:-0}")"
  printf '%-9s its disk %s: %s, used %s (%s), free %s\n' "" "$1" "$(gb "$2")" "$(gb "$3")" "$(pct "$3" "$2")" "$(gb "$4")"
  models_dev=$1
else
  printf '%-9s model cache %s: not on this host yet\n' "Storage" "$models"
  models_dev=""
fi
if [ -n "$docker_disk" ]; then
  set -- $docker_disk
  if [ "$1" = "$models_dev" ]; then
    printf '%-9s Docker (%s: images, build cache, volumes) is on the same disk\n' "" "$docker_root"
  else
    printf '%-9s Docker (%s) on %s: %s, used %s (%s), free %s\n' "" "$docker_root" "$1" "$(gb "$2")" "$(gb "$3")" "$(pct "$3" "$2")" "$(gb "$4")"
  fi
fi
end_section summary

# ── Detail ───────────────────────────────────────────────────────────────────

if [ -d /proc/driver/nvidia/gpus ]; then
  section nvidia false "NVIDIA GPUs (nvidia-smi on the host)"
  docker run --rm --privileged --pid host --entrypoint nsenter "$PROBE_IMAGE" -t 1 -m -u -i \
    nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv \
    || echo "(the driver is loaded, but nvidia-smi could not be run)"
  end_section nvidia
fi

section containers true "Containers running now: CPU and memory"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' || echo "(could not be read)"
end_section containers

section docker_disk true "Docker's disk use (RECLAIMABLE: what pruning could free; nothing is pruned here)"
docker system df || echo "(could not be read)"
end_section docker_disk

# Run as the host's sh in the host's mount namespace: the host's df, du,
# lsblk and vgs, on the host's paths.
cat > "$tmp/host.sh" <<'HOST'
models=$1; docker_root=$2
echo "--- filesystems"
df -hT -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs -x nsfs 2>/dev/null || df -h
echo
echo "--- which filesystem holds what"
for pair in "/|root" "/home|home directories" "/builds|CI checkouts (the model cache is under it)" \
            "$docker_root|Docker: images, build cache, volumes" "$models|model cache"; do
  path=${pair%%|*}; label=${pair#*|}
  [ -e "$path" ] || { printf '  %-44s %s (not on this host)\n' "$label" "$path"; continue; }
  df -P "$path" | awk -v l="$label" -v p="$path" 'NR == 2 { printf "  %-44s %s  on %s (%s)\n", l, p, $6, $1 }'
done
if [ -d "$models" ]; then
  echo
  echo "--- model cache, $(du -sh "$models" 2>/dev/null | cut -f1) in all"
  for d in "$models"/models--*; do
    [ -d "$d" ] || continue
    printf '  %-8s %s\n' "$(du -sh "$d" 2>/dev/null | cut -f1)" "$(echo "${d##*/models--}" | sed 's|--|/|')"
  done
fi
echo
echo "--- disks, partitions and logical volumes"
# Without RAM disks (1), loop (7), CD-ROM (11) and network block (43) devices.
lsblk -e 1,7,11,43 -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT 2>/dev/null || echo "(lsblk is not installed)"
if command -v vgs >/dev/null 2>&1; then
  echo
  echo "--- LVM volume groups (VFree: space not given to any volume yet)"
  vgs 2>/dev/null || echo "(vgs could not be run)"
fi
HOST

section storage false "Storage: the host's disks and filesystems"
if ! docker run --rm -i --privileged --pid host --entrypoint nsenter "$PROBE_IMAGE" -t 1 -m -u -i \
     sh -s -- "$models" "$docker_root" < "$tmp/host.sh"; then
  echo "(the host's own view could not be read; filesystems as a container sees them:)"
  docker run --rm -v /:/host:ro --entrypoint df "$PROBE_IMAGE" -h | awk 'NR == 1 || $NF ~ "^/host"'
fi
end_section storage
