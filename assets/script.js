// COUNTER
// COUNTER (improved for real-world stats)
document.querySelectorAll('.counter').forEach(c => {
  let update = () => {
    let t = parseFloat(c.dataset.target);
    let n = parseFloat(c.innerText.replace(/,/g, "")) || 0;

    let inc = t / 200;

    if (n < t) {
      let value = n + inc;

      // format nicely
      if (t >= 1000) {
        c.innerText = Math.floor(value).toLocaleString();
      } else {
        c.innerText = value.toFixed(2);
      }

      setTimeout(update, 10);
    } else {
      // final formatting
      c.innerText = t >= 1000 ? t.toLocaleString() : t;
    }
  };

  update();
});

// DARK MODE
const btn = document.getElementById("themeToggle");
const icon = document.getElementById("themeIcon");
const loader = document.getElementById("themeLoader");

// Load saved theme
if (localStorage.theme === "dark") {
  document.body.classList.add("dark-mode");
  icon.classList.replace("fa-moon", "fa-sun");
}

btn.onclick = () => {
  loader.classList.add("active");

  document.body.classList.toggle("dark-mode");

  if (document.body.classList.contains("dark-mode")) {
    icon.classList.replace("fa-moon", "fa-sun");
    localStorage.theme = "dark";
  } else {
    icon.classList.replace("fa-sun", "fa-moon");
    localStorage.theme = "light";
  }

  setTimeout(() => {
    loader.classList.remove("active");
  }, 500);
};

// SMOOTH SCROLL
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.onclick=e=>{
    e.preventDefault();
    document.querySelector(a.getAttribute("href"))
    .scrollIntoView({behavior:"smooth"});
  };
});

// REVEAL
const reveal=()=>{
  document.querySelectorAll(".reveal").forEach(el=>{
    if(el.getBoundingClientRect().top < window.innerHeight-50){
      el.classList.add("active");
    }
  });
};

window.addEventListener("scroll",reveal);