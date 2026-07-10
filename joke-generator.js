/**
 * Random Joke Generator
 * Uses the JokeAPI (https://jokeapi.dev) to fetch random jokes
 */

const https = require('https');

/**
 * Fetches a random joke from the JokeAPI
 * @param {Object} options - Configuration options
 * @param {string} options.type - 'single' or 'twopart' (default: any)
 * @param {string} options.category - Joke category (default: 'Any')
 * @returns {Promise<Object>} - Joke object
 */
function getRandomJoke(options = {}) {
  return new Promise((resolve, reject) => {
    const category = options.category || 'Any';
    const type = options.type ? `?type=${options.type}` : '';
    
    const url = `https://v2.jokeapi.dev/joke/${category}${type}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const joke = JSON.parse(data);
          
          if (joke.error) {
            reject(new Error(`API Error: ${joke.message}`));
            return;
          }

          resolve(joke);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Formats and displays a joke
 * @param {Object} joke - Joke object from the API
 * @returns {string} - Formatted joke
 */
function formatJoke(joke) {
  if (joke.type === 'single') {
    return joke.joke;
  } else if (joke.type === 'twopart') {
    return `${joke.setup}\n\n${joke.delivery}`;
  }
  return 'Unknown joke format';
}

/**
 * Main function to get and display a random joke
 */
async function displayRandomJoke() {
  try {
    console.log('Fetching a random joke...\n');
    
    const joke = await getRandomJoke({
      category: 'Any'
    });

    console.log(`Category: ${joke.category}`);
    console.log(`Type: ${joke.type}`);
    console.log('-'.repeat(50));
    console.log(formatJoke(joke));
    console.log('-'.repeat(50));

  } catch (error) {
    console.error(`Error fetching joke: ${error.message}`);
  }
}

// Export functions for use as a module
module.exports = {
  getRandomJoke,
  formatJoke
};

// Run if executed directly
if (require.main === module) {
  displayRandomJoke();
}
