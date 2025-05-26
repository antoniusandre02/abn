document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('registerForm');
    if (!form) return;
  
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
  
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
  
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });
  
        const result = await res.json();
        alert(result.message);
  
        if (res.status === 201) {
          window.location.href = '/login';
        }
      } catch (err) {
        alert('❌ Error saat registrasi');
        console.error(err);
      }
    });
  });
  