* tree

  > ```bash
  > # 只显示2层
  > tree -L 2
  >
  > # 只显示目录
  > tree -d
  >
  > # 显示文件大小
  > tree -sh
  >
  > tree -pugD
  >
  > sudo tee /etc/apt/apt.conf.d/95proxy >/dev/null <<'EOF'
  > Acquire::http::Proxy "http://127.0.0.1:7897";
  > Acquire::https::Proxy "http://127.0.0.1:7897";
  > EOF
  > ```
