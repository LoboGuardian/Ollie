{
  description = "Development shell for Ollie";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      lib = pkgs.lib;

      runtimeLibs = with pkgs; [
        gtk3
        webkitgtk_4_1
        libsoup_3
        libayatana-appindicator
        libcanberra-gtk3
        xdotool
        librsvg
        cairo
        pango
        gdk-pixbuf
        glib
        openssl
        mesa
      ];
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          cargo
          rustc
          rustfmt
          clippy
          rust-analyzer
          cargo-tauri
          nodejs_22
          pkg-config
          openssl
          gtk3
          webkitgtk_4_1
          libsoup_3
          libayatana-appindicator
          libcanberra-gtk3
          xdotool
          librsvg
          mesa
        ];

        LD_LIBRARY_PATH = lib.makeLibraryPath runtimeLibs;

        shellHook = ''
          export OPENSSL_DIR=${pkgs.openssl.dev}
          export OPENSSL_LIB_DIR=${pkgs.lib.getLib pkgs.openssl}/lib
          export OPENSSL_INCLUDE_DIR=${pkgs.openssl.dev}/include
          export PKG_CONFIG_PATH=${lib.makeSearchPathOutput "dev" "lib/pkgconfig" runtimeLibs}:$PKG_CONFIG_PATH
          export WEBKIT_DISABLE_COMPOSITING_MODE=1
          export WEBKIT_DISABLE_DMABUF_RENDERER=1

          echo "Ollie dev shell ready"
          echo "Run: cd app && npm install"
          echo "Then: cargo tauri dev"
        '';
      };
    };
}
