(() => {
  // <stdin>
  var localStorageTheme = localStorage.getItem("theme");
  var systemThemeSetting = window.matchMedia("(prefers-color-scheme: light)");
  var themeToggleBtn = document.querySelector(".theme-toggle");
  function calculateSettingAsThemeString(localStorageTheme2, systemThemeSetting2) {
    if (localStorageTheme2 !== null) {
      return localStorageTheme2;
    }
    if (systemThemeSetting2.matches) {
      return "light";
    }
    return "dark";
  }
  var currentTheme = calculateSettingAsThemeString(localStorageTheme, systemThemeSetting);
  window.onload = function() {
    document.querySelector("html").setAttribute("data-theme", currentTheme);
  };
  themeToggleBtn.addEventListener("click", () => {
    let newTheme;
    if (currentTheme === "dark") {
      newTheme = "light";
    } else {
      newTheme = "dark";
    }
    document.querySelector("html").setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    currentTheme = newTheme;
  });
})();
