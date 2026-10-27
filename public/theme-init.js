
      // 首屏前确定主题，避免深色用户看到白屏闪烁
      try {
        var savedTheme = localStorage.getItem("gejian:theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.dataset.theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : prefersDark ? "dark" : "light";
      } catch (_) {
        document.documentElement.dataset.theme = "light";
      }
      // 背景动效偏好也在首屏前应用，避免进入反应测试时先动一下再停住。
      try {
        var savedBackgroundMotion = localStorage.getItem("gejian:background-motion");
        var initialGame = location.hash.slice(1);
        document.documentElement.dataset.backgroundMotion = savedBackgroundMotion === "on" || savedBackgroundMotion === "off"
          ? savedBackgroundMotion
          : initialGame === "reaction" ? "off" : "on";
      } catch (_) {
        document.documentElement.dataset.backgroundMotion = location.hash === "#reaction" ? "off" : "on";
      }
