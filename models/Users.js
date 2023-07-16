const mongoose=require('mongoose');
const userSchema=new mongoose.Schema({
    fullName:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        required:true,
        Unique:true
    },
    password:{
        type:String,
        required:true
    },
    token:{
        type:String
    }
})
const Users=mongoose.model('User',userSchema);
module.exports=Users