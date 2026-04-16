import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';

console.log('CWD:', process.cwd());
console.log('KEY:', process.env.PIXABAY_API_KEY ? 'OK' : 'MISSING');

const run = async () => {
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=travel&per_page=10`
    );

    const data = await res.json();

    // 🔍 Verifica se veio imagem
    if (!data.hits || data.hits.length === 0) {
      console.log('Nenhuma imagem encontrada.');
      return;
    }

    const photo = data.hits[0];

    console.log('\n📸 Primeira imagem encontrada:');
    console.log(`ID: ${photo.id}`);
    console.log(`Autor: ${photo.user}`);

    // 🧾 Mostrar todas as opções de imagem
    console.log('\n🧾 URLs disponíveis:');
    console.log(JSON.stringify({
      largeImageURL: photo.largeImageURL,
      webformatURL: photo.webformatURL,
      previewURL: photo.previewURL
    }, null, 2));

    // 📥 Escolhe melhor qualidade
    const imageUrl = photo.largeImageURL;

    console.log('\n⬇️ Baixando imagem...');
    console.log(imageUrl);

    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    fs.mkdirSync('images', { recursive: true });

    const filePath = `images/pixabay-${photo.id}.jpg`;

    fs.writeFileSync(filePath, Buffer.from(buffer));

    console.log(`\n✅ Imagem salva em: ${filePath}`);

  } catch (err) {
    console.error('Erro:', err.message);
  }
};

run();
