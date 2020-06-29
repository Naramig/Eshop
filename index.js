const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
var CryptoJS = require("crypto-js");
const { Client } = require('pg');

const SESSION_EXPIRATION_TIME = '10 minutes'

const app = express();
app.use(bodyParser.json());

//Connection to DB
const connectionString = 'postgres://nikolai:Naramig30@localhost:5432/eshop';
const client = new Client({
    connectionString: connectionString
});
client.connect();


app.post('/signup', async (req, res) => {
  try{
    var login=req.body.login;
    var password=req.body.password;
    if(!login || !password){
      throw "Provide login and password correctly";
    }
    checkUsersLogin = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if(checkUsersLogin.rows.length != 0){
      throw "Change your login"
    }

    var passwordHash = await bcrypt.hash(password, 10);
    await client.query("INSERT INTO \"User\" (login, password) values($1, $2)", [login, passwordHash]);
    res.status(201).send("Inserted");
  }catch(error){
    res.status(200).send(error);
  }
})

app.post('/signin', async (req, res) => {
  try{
    var login=req.body.login;
    var password=req.body.password;

    var userInfo = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if( userInfo.rows.length == 0){
      throw "Login or Password is incorrect";
    }
    var userId =  userInfo.rows[0].id;
    var isPasswordCorrect = await bcrypt.compare(password, userInfo.rows[0].password);
    if(!isPasswordCorrect){
      throw "Login or Password is incorrect";
    }
    var salt = CryptoJS.lib.WordArray.random(128 / 8);
    var key128Bits = CryptoJS.PBKDF2("Secret Passphrase", salt, { keySize: 128 / 32});

    await client.query("INSERT INTO \"Session\" (key, user_id) values($1, $2)", [key128Bits.toString(), userId]);

    res.status(200).send(JSON.parse("{\"session_key\": \"" + key128Bits + "\"}"));
  }catch(error){
    res.status(400).send(error);
  }
})


function CheckKey(key, callback) {
  client.query("SELECT \"User\".id FROM \"Session\" " +
               " INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id " + 
               " WHERE \"Session\".key = $1 AND \"Session\".creation_date + interval $2 >= now()",
               [key, SESSION_EXPIRATION_TIME], function (err, result) {
    return callback(err, result);
  });
}

app.get('/getCategories', async (req, res) => {
  try{
    var categories = await client.query("SELECT * FROM \"Category\"");
    res.status(200).send(categories.rows);
  }catch(error){
    res.status(200).send(error);
  }
})

app.post('/createProduct', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var name = req.body.name;

    await client.query("INSERT INTO \"Product\" (name, category_id) VALUES ( $1, $2)", [name, category_id]);
    await client.query("UPDATE \"Category\" SET category_count = category_count + 1 WHERE id = $1", [category_id]);
    res.status(200).send("Inserted");
  }catch(error){
    res.status(400).send(error);
  }
})

app.post('/deleteProduct', async (req, res) => {
  try{
    var id = req.body.id;
    var category_id;

    var product = await client.query("SELECT * FROM \"Product\" WHERE id = $1", [id]);
    if(product.rows.length == 0){
      throw "Product Not Found";
    }
    category_id = product.rows[0].category_id;

    await client.query("DELETE FROM \"Favorite\" WHERE product_id = $1", [id]);
    await client.query("DELETE FROM \"Product\" WHERE id = $1", [id]);
    await client.query("UPDATE \"Category\" SET  category_count =  category_count - 1 WHERE id = $1", [category_id]);
    res.status(200).send("Product Deleted");
  }catch(error){
    res.status(400).send(error);
  }
})

app.get('/getProducts', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var productsList;
    if(category_id){
      var productsList = await client.query("SELECT * FROM \"Product\" WHERE category_id = $1",[req.body.category_id]);
    }else{
      var productsList = await client.query("SELECT * FROM \"Product\"");
    }
    res.status(200).send(productsList.rows);
  }catch(error){
    res.status(400).send(error);
  }
})

//#################################################################################################

//Test Promise
app.get("/testPromise", (req, res) => {
  var login = req.body.login;

  return new Promise((resolve, reject) => {
    client.query('SELECT * FROM \"User\" WHERE login = $1', [login],  (err, result) => {
      if(err)
       reject(err);
      else if(result.rows.length == 0) 
        reject("No data");
      else 
        resolve(result.rows[0].id);
    })
  })
  .then(value => {
    return new Promise((resolve, reject) => { // (*)
      client.query('SELECT * FROM \"Favorite\" WHERE id = $1', [value], (err, result) => {
        if(err) 
          reject(err);
        else 
          resolve(result.rows);
      });
    });
  })
  .then(value => {
    res.send(value);
  })
  .catch(err => {
    res.send(err);
  });
})


//Test Async/Await
app.get("/testAsync", async (req, res) => {
  var login = req.body.login;
  try{
    var getUser = await client.query('SELECT * FROM \"User\" WHERE login = $1', [login])
    if(getUser.rows.length == 0){
      throw "No data was found";
    }
    var getFavorite = await client.query('SELECT * FROM \"Favorite\" WHERE id = $1', [getUser.rows[0].id]) 
    res.send(getFavorite.rows);
  }catch(error){
    res.send(error)
  }
})

 //################################################################################################

app.post('/addToFavorites', function(req, res){
  var product_id = req.body.product_id;
  var key = req.body.session_key;

  CheckKey(key.toString(), function(err, result){
    if(err){
      res.send(err);
    }else if(result.rows.length == 0){
      res.status(401).send("Login first");
    }else{
      client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [result.rows[0].id, product_id], function(err, result){
        if(err)
          throw err;
        res.status(201).send("Inserted");
      });
    }
  });
})

// app.post('/addToFavorites', async (req, res) => {
//   try{
//     var product_id = req.body.product_id;
//     var key = req.body.session_key;    
//     if(!key || !product_id){
//       throw "Wrong data";
//     }
//     var checkKey = await CheckKey(key.toString());
//     console.log(checkKey);
//     if(checkKey.rows.length == 0){
//       throw "Login first";
//     } else if(checkKey.err){
//       throw checkKey.err;
//     }
//     var user_id = checkKey.rows[0].id;
//     await client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [user_id, product_id]);

//     res.status(201).send("Inserted");
//   }catch(error){
//     res.status(400).send(error);
//   }
// })

app.get('/getFavorites', function(req, res){
  var key = req.body.session_key;

  checkKey(key.toString(), function(err, result){
    if(err){
      res.send(err);
    }else if(result.rows.length == 0){
      res.send("Login first");
    }else{
      client.query("SELECT \"Product\".id, \"Product\".name" +
                    " FROM \"Favorite\" "+
                    " INNER JOIN \"Product\" ON \"Product\".id = \"Favorite\".product_id" +
                    " INNER JOIN \"User\" ON \"User\".id = \"Favorite\".user_id "+
                    " WHERE \"User\".id = $1",
                    [result.rows[0].id], function(err, result){
                      if(err)
                        throw err;
                    res.send(result.rows);
            });
    }
  });
})

app.listen(4000, function () {
    console.log('Server is running.. on Port 4000');
});
